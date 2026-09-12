import { describe, expect, it, vi } from "vitest";
import { createProviderCascade, providerLabel } from "./provider-cascade";
import { JobSearchNotConfiguredError, type JobSearchProviderName, type JobSearchQuery, type JobSearchResult } from "./search-provider";

const query: JobSearchQuery = { keywords: "Engagement Manager", country: "sg" };

function result(url: string): JobSearchResult {
  return {
    title: "Engagement Manager",
    employer: "Example",
    location: "Singapore",
    description: "A role.",
    url,
    salary: null,
    postedAt: null,
    source: "Google for Jobs",
    platforms: [],
    applyDirect: false,
  };
}

/** Records the order providers were asked in, so a cascade can be told from a fan-out. */
function recorder(behaviour: Partial<Record<JobSearchProviderName, () => Promise<JobSearchResult[]>>>) {
  const asked: JobSearchProviderName[] = [];
  const search = async (provider: JobSearchProviderName) => {
    asked.push(provider);
    const step = behaviour[provider];
    return step ? step() : [];
  };
  return { asked, search };
}

const BOTH: JobSearchProviderName[] = ["jsearch", "adzuna"];

describe("provider cascade", () => {
  /*
   * The behaviour the whole change exists for. Every query used to go to both
   * providers at once, spending a metered allowance twice and mixing shallow
   * records into a pool ranked on how fully each advert matches.
   */
  it("stops at the first provider that has results", async () => {
    const { asked, search } = recorder({ jsearch: async () => [result("https://a")] });
    const cascade = createProviderCascade(BOTH, { search });

    await expect(cascade.run(query)).resolves.toHaveLength(1);
    expect(asked).toEqual(["jsearch"]);
    expect([...cascade.used]).toEqual(["Google for Jobs"]);
  });

  /*
   * Empty is not failure. A market where the deep provider simply carries
   * nothing for this title is the one moment the shallow one earns its keep.
   */
  it("falls through to the next provider on an empty answer, without blaming it", async () => {
    const { asked, search } = recorder({
      jsearch: async () => [],
      adzuna: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(BOTH, { search });

    await expect(cascade.run(query)).resolves.toHaveLength(1);
    expect(asked).toEqual(["jsearch", "adzuna"]);
    expect(cascade.isDead("jsearch")).toBe(false);
    expect(cascade.errors).toEqual([]);
  });

  it("falls through on a thrown error and reports it", async () => {
    const { asked, search } = recorder({
      jsearch: async () => { throw new Error("JSearch returned 401 — not subscribed"); },
      adzuna: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(BOTH, { search });

    await expect(cascade.run(query)).resolves.toHaveLength(1);
    expect(asked).toEqual(["jsearch", "adzuna"]);
    expect(cascade.errors[0]).toContain("Google for Jobs");
    expect(cascade.errors[0]).toContain("not subscribed");
  });

  /*
   * The mechanism that did not exist before: the failed-provider set was read
   * in three places and written to in none, so a provider 401ing on every call
   * was asked again on every call for the whole run.
   */
  it("drops a provider that keeps failing, and stops asking it", async () => {
    const { asked, search } = recorder({
      jsearch: async () => { throw new Error("boom"); },
      adzuna: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(BOTH, { search, failuresBeforeDead: 2 });

    await cascade.run(query);
    expect(cascade.isDead("jsearch")).toBe(false); // one strike
    await cascade.run(query);
    expect(cascade.isDead("jsearch")).toBe(true); // two strikes

    asked.length = 0;
    await cascade.run(query);
    expect(asked).toEqual(["adzuna"]);
  });

  /*
   * One timeout is weather. Retiring the deep provider on a single blip spends
   * the rest of the search on the shallow one.
   */
  it("does not retire a provider whose failure was followed by a success", async () => {
    let call = 0;
    const search = async () => {
      call += 1;
      if (call === 1) throw new Error("blip");
      return [result(`https://${call}`)];
    };
    const cascade = createProviderCascade(BOTH, { search, failuresBeforeDead: 2 });

    await cascade.run(query);
    await cascade.run(query);
    await cascade.run(query);

    expect(cascade.isDead("jsearch")).toBe(false);
  });

  /* No number of retries turns a missing key into a present one. */
  it("retires an unconfigured provider on the first attempt", async () => {
    const { search } = recorder({
      jsearch: async () => { throw new JobSearchNotConfiguredError(); },
      adzuna: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(BOTH, { search });

    await cascade.run(query);
    expect(cascade.isDead("jsearch")).toBe(true);
    expect(cascade.errors).toEqual(["Google for Jobs is not configured."]);
  });

  it("reports exhaustion only when every provider is out", async () => {
    const { search } = recorder({
      jsearch: async () => { throw new JobSearchNotConfiguredError(); },
      adzuna: async () => { throw new JobSearchNotConfiguredError(); },
    });
    const cascade = createProviderCascade(BOTH, { search });

    await cascade.run(query);
    expect(cascade.exhausted()).toBe(true);
    await expect(cascade.run(query)).resolves.toEqual([]);
  });

  /* A slow query must not put a red error across a page that did find roles. */
  it("keeps a timeout out of the user-facing errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    const { search } = recorder({ jsearch: async () => { throw timeout; } });
    const cascade = createProviderCascade(BOTH, { search });

    await cascade.run(query);

    expect(cascade.errors).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("names each provider one way", () => {
    expect(providerLabel("jsearch")).toBe("Google for Jobs");
    expect(providerLabel("adzuna")).toBe("Adzuna");
  });
});

/*
 * A timeout used to go to the server console and nowhere else, so the deep
 * provider dropping out of a search was invisible: the page just showed
 * shallower results from the fallback with no explanation, which reads exactly
 * like a market with nothing in it.
 */
describe("timeouts are counted, not just logged", () => {
  function timeoutError() {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    return error;
  }

  it("counts each timeout against the provider that had it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { search } = recorder({
      jsearch: async () => { throw timeoutError(); },
      adzuna: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(BOTH, { search, failuresBeforeDead: 5 });

    await cascade.run(query);
    await cascade.run(query);

    expect(cascade.timeouts.get("Google for Jobs")).toBe(2);
    expect(cascade.timeouts.has("Adzuna")).toBe(false);
    /* Still not phrased at the reader as something they did wrong. */
    expect(cascade.errors).toEqual([]);
    warn.mockRestore();
  });

  it("reports nothing when everything answered in time", async () => {
    const { search } = recorder({ jsearch: async () => [result("https://a")] });
    const cascade = createProviderCascade(BOTH, { search });

    await cascade.run(query);

    expect(cascade.timeouts.size).toBe(0);
  });
});

/*
 * The rate-limit gap in runBriefSearch asks the cascade which providers a query
 * actually reached. It used to ask which were configured, which is a different
 * question the moment a provider ahead of JSearch in the order starts
 * answering: SerpApi replies, JSearch is never called, and the run still pays
 * RapidAPI's one-second spacing on every query out of a 45-second budget.
 */
describe("which providers the last query actually reached", () => {
  const ORDER: JobSearchProviderName[] = ["serpapi", "jsearch", "adzuna"];

  it("does not count a provider the first one made unnecessary", async () => {
    const { search } = recorder({ serpapi: async () => [result("https://a")] });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect(cascade.calledLast("serpapi")).toBe(true);
    expect(cascade.calledLast("jsearch")).toBe(false);
    expect(cascade.calledLast("adzuna")).toBe(false);
  });

  it("counts a provider reached because the one before it was empty", async () => {
    const { search } = recorder({
      serpapi: async () => [],
      jsearch: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect(cascade.calledLast("jsearch")).toBe(true);
    expect(cascade.calledLast("adzuna")).toBe(false);
  });

  /* Each query answers for itself: a reach last time is not a reach this time. */
  it("forgets the previous query", async () => {
    let firstQuery = true;
    const { search } = recorder({
      serpapi: async () => (firstQuery ? [] : [result("https://c")]),
      jsearch: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);
    expect(cascade.calledLast("jsearch")).toBe(true);

    firstQuery = false;
    await cascade.run(query);
    expect(cascade.calledLast("jsearch")).toBe(false);
  });

  it("skips a provider that is already dead", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new JobSearchNotConfiguredError(); },
      jsearch: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);
    expect(cascade.calledLast("serpapi")).toBe(true);

    await cascade.run(query);
    expect(cascade.calledLast("serpapi")).toBe(false);
    expect(cascade.calledLast("jsearch")).toBe(true);
  });
});

/*
 * A provider behind the one that answered can fail all day without changing a
 * single result. Reporting it under the person's results is noise — and with
 * JSearch sitting behind SerpApi on a spent RapidAPI allowance it was worse
 * than noise: every successful search would have carried "you have exceeded
 * the MONTHLY quota, upgrade your plan at rapidapi.com" beneath it.
 */
describe("which failures are worth telling the person about", () => {
  const ORDER: JobSearchProviderName[] = ["serpapi", "jsearch", "adzuna"];

  it("says nothing about a provider the answer made unnecessary", async () => {
    const { search } = recorder({
      serpapi: async () => [result("https://a")],
      jsearch: async () => { throw new Error("429 — MONTHLY quota exceeded, upgrade at rapidapi.com"); },
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect(cascade.errorsThatCostResults()).toEqual([]);
  });

  /*
   * A failure ahead of the answer is different: the results came from further
   * down the cascade than they should have, and a blurb where a full advert
   * was expected is something the person should know about.
   */
  it("reports a failure that pushed the answer further down the cascade", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new Error("bad key"); },
      jsearch: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect(cascade.errorsThatCostResults()).toEqual(["Google for Jobs (SerpApi): bad key"]);
  });

  /* Nobody answered, so every failure is the reason there is nothing to show. */
  it("reports everything when no provider answered", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new Error("bad key"); },
      jsearch: async () => { throw new Error("429"); },
      adzuna: async () => { throw new Error("500"); },
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect(cascade.errorsThatCostResults()).toHaveLength(3);
  });

  /*
   * The full list is still kept, for the log and for the nobody-answered case.
   *
   * Reaching JSearch at all takes a query the lead provider had nothing for —
   * empty is not failure, so the cascade carries on rather than stopping. Once
   * any other query has been answered by the lead, its 429 stops being the
   * reason anybody's results look the way they do.
   */
  it("keeps every failure in errors regardless", async () => {
    let firstQuery = true;
    const { search } = recorder({
      serpapi: async () => (firstQuery ? [] : [result("https://a")]),
      jsearch: async () => { throw new Error("429"); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search, failuresBeforeDead: 5 });

    await cascade.run(query);
    firstQuery = false;
    await cascade.run(query);

    expect(cascade.errors).toEqual(["Google for Jobs: 429"]);
    expect(cascade.errorsThatCostResults()).toEqual([]);
  });

  /*
   * Reaching the fallback is not the same as the lead provider being broken.
   * A market where SerpApi simply carries nothing for one title is exactly
   * when the fallback earns its place, and it is not worth a warning.
   */
  it("stays quiet when the lead was merely empty rather than failing", async () => {
    const { search } = recorder({
      serpapi: async () => [],
      jsearch: async () => { throw new Error("429 — upgrade at rapidapi.com"); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    /* JSearch sat ahead of the answer, so this one did cost the deeper advert. */
    expect(cascade.errorsThatCostResults()).toEqual(["Google for Jobs: 429 — upgrade at rapidapi.com"]);
  });

  it("does not repeat the same failure across queries", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new Error("bad key"); },
      jsearch: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(ORDER, { search, failuresBeforeDead: 5 });

    await cascade.run(query);
    await cascade.run(query);

    expect(cascade.errorsThatCostResults()).toEqual(["Google for Jobs (SerpApi): bad key"]);
  });
});

/*
 * `used` has one consumer: the "via Google for Jobs + Adzuna" line under the
 * results. It is a claim about where the roles on the page came from, so a
 * provider that supplied none of them must not appear in it.
 */
describe("which providers are named as sources", () => {
  const ORDER: JobSearchProviderName[] = ["serpapi", "jsearch", "adzuna"];

  it("does not name a provider that carried nothing", async () => {
    const { search } = recorder({
      serpapi: async () => [],
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect([...cascade.used]).toEqual(["Adzuna"]);
  });

  it("names a provider once it has supplied a result", async () => {
    const { search } = recorder({ serpapi: async () => [result("https://a")] });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect([...cascade.used]).toEqual(["Google for Jobs (SerpApi)"]);
  });

  /* Both, when different queries were answered by different providers. */
  it("names every provider that supplied something across the run", async () => {
    let firstQuery = true;
    const { search } = recorder({
      serpapi: async () => (firstQuery ? [] : [result("https://a")]),
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);
    firstQuery = false;
    await cascade.run(query);

    expect([...cascade.used].sort()).toEqual(["Adzuna", "Google for Jobs (SerpApi)"]);
  });
});

/*
 * A provider explains its refusal in its own interest. RapidAPI answers a
 * spent allowance with "Upgrade your plan at https://rapidapi.com/..." — and
 * passed through untouched, that printed a vendor's upsell link under somebody
 * else's job results, for a provider they do not even pay for.
 */
describe("what a provider's own error text is allowed to say", () => {
  const ORDER: JobSearchProviderName[] = ["serpapi", "jsearch", "adzuna"];

  async function noteFor(message: string) {
    const { search } = recorder({
      serpapi: async () => { throw new Error(message); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });
    await cascade.run(query);
    return { note: cascade.errorsThatCostResults()[0], logged: cascade.errors[0] };
  }

  it("keeps the cause and drops the sales pitch", async () => {
    const { note } = await noteFor(
      "429 — You have exceeded the MONTHLY quota for Requests on your current plan, BASIC. Upgrade your plan at https://rapidapi.com/letscrape/api/jsearch",
    );
    expect(note).toContain("exceeded the MONTHLY quota");
    expect(note).not.toContain("rapidapi.com");
    expect(note).not.toMatch(/upgrade/i);
  });

  it("does not leave a sentence dangling on the word that carried the link", async () => {
    const { note } = await noteFor("Your account has run out of searches. See https://serpapi.com/pricing");
    expect(note).toBe("Google for Jobs (SerpApi): Your account has run out of searches");
  });

  /*
   * The clause strip only fires when a link was actually removed, so an error
   * that happens to end on one of those words keeps its meaning.
   */
  it("leaves an error with no link exactly as it was", async () => {
    const { note } = await noteFor("could not see the country");
    expect(note).toBe("Google for Jobs (SerpApi): could not see the country");
  });

  it("still logs every word for the server", async () => {
    const { logged } = await noteFor("429 — quota gone. Upgrade at https://rapidapi.com/x");
    expect(logged).toContain("rapidapi.com");
  });
});

/*
 * "Timed out 2 times" reads the same whether the budget was too tight or the
 * provider is down — opposite diagnoses from one sentence. The wait is what
 * separates them, and a search that gave SerpApi six seconds reported the
 * identical line to one that gave it twenty.
 */
describe("how long a timed-out call was given", () => {
  function timeoutError() {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    return error;
  }

  it("remembers the wait alongside the count", async () => {
    const { search } = recorder({
      serpapi: async () => { throw timeoutError(); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(["serpapi", "adzuna"], { search, failuresBeforeDead: 5 });

    await cascade.run({ ...query, timeoutMs: 20_000 });

    expect(cascade.timeouts.get("Google for Jobs (SerpApi)")).toBe(1);
    expect(cascade.timeoutWaits.get("Google for Jobs (SerpApi)")).toBe(20_000);
  });

  /* The longest wait, so a tight late query cannot understate what it was given. */
  it("keeps the longest wait rather than the last", async () => {
    const { search } = recorder({
      serpapi: async () => { throw timeoutError(); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(["serpapi", "adzuna"], { search, failuresBeforeDead: 5 });

    await cascade.run({ ...query, timeoutMs: 20_000 });
    await cascade.run({ ...query, timeoutMs: 6_000 });

    expect(cascade.timeoutWaits.get("Google for Jobs (SerpApi)")).toBe(20_000);
  });

  it("reports nothing for a provider that answered in time", async () => {
    const { search } = recorder({ serpapi: async () => [result("https://a")] });
    const cascade = createProviderCascade(["serpapi", "adzuna"], { search });

    await cascade.run({ ...query, timeoutMs: 20_000 });

    expect(cascade.timeoutWaits.size).toBe(0);
  });
});

/*
 * Concurrency and pacing have to read the live cascade, not the configured
 * list. Both were sized once from providers[0] and stayed there after the lead
 * provider retired — the same shape of bug as a timeout floor sized for
 * whichever provider happens to be first.
 */
describe("what the live lead is", () => {
  const ORDER: JobSearchProviderName[] = ["serpapi", "jsearch", "adzuna"];

  /** What runBriefSearch does to decide batch size and whether to pace. */
  const liveLead = (cascade: ReturnType<typeof createProviderCascade>) =>
    ORDER.find((provider) => !cascade.isDead(provider)) ?? null;

  it("is the configured first provider while it is alive", async () => {
    const { search } = recorder({ serpapi: async () => [result("https://a")] });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect(liveLead(cascade)).toBe("serpapi");
  });

  /*
   * The bug: after SerpApi retires the lead is JSearch, which allows one
   * request a second. Anything still reading providers[0] would keep firing
   * three at a time, un-paced, straight at that limit.
   */
  it("moves on once the first provider retires", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new Error("bad key"); },
      jsearch: async () => [result("https://b")],
    });
    const cascade = createProviderCascade(ORDER, { search, failuresBeforeDead: 2 });

    await cascade.run(query);
    await cascade.run(query);

    expect(cascade.isDead("serpapi")).toBe(true);
    expect(liveLead(cascade)).toBe("jsearch");
  });

  it("falls through to the last provider standing", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new Error("bad key"); },
      jsearch: async () => { throw new Error("429"); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search, failuresBeforeDead: 1 });

    await cascade.run(query);

    expect(liveLead(cascade)).toBe("adzuna");
  });

  it("has no lead once everything is dead", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new Error("x"); },
      jsearch: async () => { throw new Error("x"); },
      adzuna: async () => { throw new Error("x"); },
    });
    const cascade = createProviderCascade(ORDER, { search, failuresBeforeDead: 1 });

    await cascade.run(query);

    expect(liveLead(cascade)).toBeNull();
    expect(cascade.exhausted()).toBe(true);
  });
});

/*
 * A timeout is not free, and the deep provider's timeout is the most expensive
 * thing in a search. A measured run spent sixty seconds of a seventy-five
 * second budget on three SerpApi timeouts before retiring it, leaving
 * twenty-one of twenty-five queries unrun.
 */
describe("what a full-budget timeout costs", () => {
  function timeoutError() {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    return error;
  }

  const ORDER: JobSearchProviderName[] = ["serpapi", "adzuna"];

  it("retires a provider that was given everything and still said nothing", async () => {
    const { search } = recorder({
      serpapi: async () => { throw timeoutError(); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    /* 20_000 is SerpApi's full call budget: it asked for all of it and timed out. */
    await cascade.run({ ...query, timeoutMs: 20_000 });

    expect(cascade.isDead("serpapi")).toBe(true);
  });

  /*
   * A timeout cut short by a tight budget late in a run really is weather, and
   * still gets the usual two chances.
   */
  it("gives a short-budget timeout the usual second chance", async () => {
    const { search } = recorder({
      serpapi: async () => { throw timeoutError(); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run({ ...query, timeoutMs: 4_000 });
    expect(cascade.isDead("serpapi")).toBe(false);

    await cascade.run({ ...query, timeoutMs: 4_000 });
    expect(cascade.isDead("serpapi")).toBe(true);
  });

  /* An error is still an error: two chances, however long the call was given. */
  it("does not retire a fast failure on the first attempt", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new Error("500 from upstream"); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run({ ...query, timeoutMs: 20_000 });

    expect(cascade.isDead("serpapi")).toBe(false);
  });

  it("still counts the timeout and the wait for the report", async () => {
    const { search } = recorder({
      serpapi: async () => { throw timeoutError(); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run({ ...query, timeoutMs: 20_000 });

    expect(cascade.timeouts.get("Google for Jobs (SerpApi)")).toBe(1);
    expect(cascade.timeoutWaits.get("Google for Jobs (SerpApi)")).toBe(20_000);
  });
});

/*
 * The deep provider is worth having and cannot carry a whole search. SerpApi
 * on the free plan answers a simple query in 15.6 seconds and sometimes not at
 * all inside sixty — against a 25-query plan in a 75-second budget, asking it
 * everything means it answers nothing and spends the budget failing.
 */
describe("rationing the deep provider", () => {
  const ORDER: JobSearchProviderName[] = ["serpapi", "adzuna"];

  it("asks it up to its ration and then stops", async () => {
    const { asked, search } = recorder({
      serpapi: async () => [result("https://a")],
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search, maxCalls: { serpapi: 2 } });

    await cascade.run(query);
    await cascade.run(query);
    await cascade.run(query);

    expect(asked.filter((provider) => provider === "serpapi")).toHaveLength(2);
    expect(cascade.calls.get("Google for Jobs (SerpApi)")).toBe(2);
  });

  /* The query is still answered — by whoever is behind it. */
  it("falls through to the next provider once the ration is spent", async () => {
    const { asked, search } = recorder({
      serpapi: async () => [result("https://a")],
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search, maxCalls: { serpapi: 1 } });

    await cascade.run(query);
    await expect(cascade.run(query)).resolves.toHaveLength(1);

    expect(asked).toEqual(["serpapi", "adzuna"]);
  });

  /*
   * Out of ration is not out of order. Marking it dead would put an error on
   * the page about a provider that was working perfectly.
   */
  it("does not call a rationed provider dead", async () => {
    const { search } = recorder({
      serpapi: async () => [result("https://a")],
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search, maxCalls: { serpapi: 1 } });

    await cascade.run(query);
    await cascade.run(query);

    expect(cascade.isDead("serpapi")).toBe(false);
    expect(cascade.errors).toEqual([]);
    expect(cascade.exhausted()).toBe(false);
  });

  /*
   * willAsk answers one question with two reasons behind it. The call budget
   * and the batch size in runBriefSearch are both sized for whichever provider
   * leads; reading the dead set instead would miss a rationed one and leave
   * three concurrent un-paced calls aimed at a one-per-second provider.
   */
  it("says the rationed provider will not be asked again", async () => {
    const { search } = recorder({
      serpapi: async () => [result("https://a")],
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search, maxCalls: { serpapi: 1 } });

    expect(cascade.willAsk("serpapi")).toBe(true);
    await cascade.run(query);
    expect(cascade.willAsk("serpapi")).toBe(false);
    expect(cascade.willAsk("adzuna")).toBe(true);
  });

  it("says a dead provider will not be asked either", async () => {
    const { search } = recorder({
      serpapi: async () => { throw new JobSearchNotConfiguredError(); },
      adzuna: async () => [result("https://c")],
    });
    const cascade = createProviderCascade(ORDER, { search });

    await cascade.run(query);

    expect(cascade.willAsk("serpapi")).toBe(false);
  });

  it("leaves an unrationed provider alone however many queries run", async () => {
    const { asked, search } = recorder({ adzuna: async () => [result("https://c")] });
    const cascade = createProviderCascade(["adzuna"], { search, maxCalls: { serpapi: 1 } });

    await cascade.run(query);
    await cascade.run(query);
    await cascade.run(query);

    expect(asked).toHaveLength(3);
  });

  /* A spent ration is not a reason to stop searching. */
  it("is not exhausted when only the rationed provider is spent", async () => {
    const { search } = recorder({ serpapi: async () => [result("https://a")] });
    const cascade = createProviderCascade(ORDER, { search, maxCalls: { serpapi: 1 } });

    await cascade.run(query);

    expect(cascade.exhausted()).toBe(false);
  });
});
