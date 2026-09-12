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
