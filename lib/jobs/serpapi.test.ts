import { afterEach, describe, expect, it } from "vitest";
import {
  buildSerpApiParams,
  chooseApplyUrl,
  extractSerpApiJobs,
  isNoResultsMessage,
  keepScheduleTypes,
  mapSerpApiResult,
  pollDelayMs,
  readSerpApiPlatforms,
  readSerpApiSearchId,
  readSerpApiStatus,
  searchSerpApi,
  serpApiConfig,
} from "./serpapi";

const advert = {
  title: "ServiceNow Engagement Manager",
  company_name: "Accenture",
  location: "Singapore",
  description: "Lead ServiceNow ITSM delivery for enterprise clients across ASEAN.",
  via: "via LinkedIn",
  share_link: "https://google.com/search?q=job",
  apply_options: [{ title: "LinkedIn", link: "https://linkedin.com/jobs/1" }],
};

afterEach(() => {
  delete process.env.SERPAPI_KEY;
  delete process.env.SERPAPI_API_KEY;
});

describe("serpApiConfig", () => {
  it("reads either spelling of the key and is absent without one", () => {
    expect(serpApiConfig()).toBeNull();
    process.env.SERPAPI_KEY = "k1";
    expect(serpApiConfig()?.key).toBe("k1");
    delete process.env.SERPAPI_KEY;
    process.env.SERPAPI_API_KEY = "k2";
    expect(serpApiConfig()?.key).toBe("k2");
  });
});

describe("buildSerpApiParams", () => {
  it("asks Google for jobs, in the market's own words", () => {
    const params = buildSerpApiParams({ keywords: "Engagement Manager", country: "sg" }, "key");
    expect(params.get("engine")).toBe("google_jobs");
    expect(params.get("q")).toBe("Engagement Manager");
    expect(params.get("location")).toBe("Singapore");
    expect(params.get("gl")).toBe("sg");
  });

  /* The city wins over the country: it is the more deliberate instruction. */
  it("prefers a named city to the whole market", () => {
    const params = buildSerpApiParams({ keywords: "Practice Lead", country: "sg", location: "Jurong" }, "key");
    expect(params.get("location")).toBe("Jurong");
  });

  /*
   * The employer rides in the query text, as it does for the other two. An
   * employer filter each provider spells differently is three chances to send
   * one of them something it refuses — which is exactly what `company` did to
   * Adzuna.
   */
  it("folds the employer into the query rather than inventing a parameter", () => {
    const params = buildSerpApiParams({ keywords: "Engagement Manager", country: "sg", employer: "Accenture" }, "key");
    expect(params.get("q")).toBe("Engagement Manager Accenture");
    expect(params.get("company")).toBeNull();
    expect(params.get("employer")).toBeNull();
  });

  /*
   * Employment type has been wrong here twice, in opposite directions, and
   * both times the whole search returned nothing.
   *
   * First a hand-built chips parameter, which Google answers with nothing
   * because a chip is a token it mints rather than one a caller composes.
   * Then the words "full time" appended to the query, which Google matches as
   * words it expects to find — turning a rare title into an even rarer
   * four-term match and returning nothing again.
   *
   * Nothing about employment type goes into the query now. It is read back off
   * the results instead.
   */
  it("never sends a hand-built chip", () => {
    const params = buildSerpApiParams(
      { keywords: "Engagement Manager", country: "sg", employmentTypes: ["Full-time"] },
      "key",
    );
    expect(params.get("chips")).toBeNull();
    expect(params.toString()).not.toContain("employment_type");
  });

  it("keeps the query to the title, with no employment words added", () => {
    const params = buildSerpApiParams(
      { keywords: "ServiceNow Delivery Director", country: "sg", employmentTypes: ["Full-time"] },
      "key",
    );
    expect(params.get("q")).toBe("ServiceNow Delivery Director");
  });

  it("adds nothing for several selections either", () => {
    const params = buildSerpApiParams(
      { keywords: "Analyst", country: "sg", employmentTypes: ["Full-time", "Contract"] },
      "key",
    );
    expect(params.get("q")).toBe("Analyst");
  });

  /* Employer still rides in the query, because an employer is part of a search. */
  it("keeps the employer", () => {
    const params = buildSerpApiParams(
      { keywords: "Engagement Manager", country: "sg", employer: "Accenture", employmentTypes: ["Full-time"] },
      "key",
    );
    expect(params.get("q")).toBe("Engagement Manager Accenture");
  });
});

describe("mapSerpApiResult", () => {
  it("maps a complete advert and prefers a real apply link to the share link", () => {
    const result = mapSerpApiResult({ ...advert, detected_extensions: { posted_at: "3 days ago", salary: "8,000 a month" } });
    expect(result).toMatchObject({
      title: "ServiceNow Engagement Manager",
      employer: "Accenture",
      location: "Singapore",
      url: "https://linkedin.com/jobs/1",
      salary: "8,000 a month",
      postedAt: "3 days ago",
      source: "Google for Jobs",
    });
  });

  it("falls back to the share link when there is no apply route", () => {
    expect(mapSerpApiResult({ ...advert, apply_options: [] })?.url).toBe("https://google.com/search?q=job");
  });

  /*
   * Reported live from a Singapore search. Google for Jobs carried the vacancy
   * "via MyCareersFuture" — the Singapore government's own job bank — and the
   * card still opened a Google results page, because an unrecognised board
   * loses to Google's own listing page. The boards were the thing missing, not
   * the ranking.
   */
  it("prefers a Singapore board over Google's own listing page", () => {
    expect(mapSerpApiResult({
      ...advert,
      apply_options: [{ title: "MyCareersFuture", link: "https://www.mycareersfuture.gov.sg/job/123" }],
    })?.url).toBe("https://www.mycareersfuture.gov.sg/job/123");

    expect(mapSerpApiResult({
      ...advert,
      apply_options: [{ title: "foundit", link: "https://www.foundit.sg/job/456" }],
    })?.url).toBe("https://www.foundit.sg/job/456");
  });

  /* A card with no link is a tease; better to drop the record. */
  it("drops a record with nowhere to send anybody", () => {
    expect(mapSerpApiResult({ ...advert, apply_options: [], share_link: undefined })).toBeNull();
    expect(mapSerpApiResult({ ...advert, description: "  " })).toBeNull();
    expect(mapSerpApiResult({ ...advert, title: undefined })).toBeNull();
  });
});

describe("readSerpApiPlatforms", () => {
  it("names the boards and strips Google's 'via'", () => {
    const { platforms } = readSerpApiPlatforms({
      ...advert,
      apply_options: [{ title: "LinkedIn" }, { title: "Indeed" }],
    });
    expect(platforms).toEqual(["LinkedIn", "Indeed"]);
  });

  it("spots the employer's own site among the apply routes", () => {
    expect(readSerpApiPlatforms({
      ...advert,
      apply_options: [{ title: "Accenture Careers" }],
    }).applyDirect).toBe(true);

    expect(readSerpApiPlatforms({ ...advert, apply_options: [{ title: "Indeed" }] }).applyDirect).toBe(false);
  });

  it("ignores junk a third party might send", () => {
    const { platforms } = readSerpApiPlatforms({
      ...advert,
      via: "   ",
      apply_options: [{ title: "" }, { title: "x".repeat(80) }, { title: "Seek" }],
    });
    expect(platforms).toEqual(["Seek"]);
  });
});

/*
 * SerpApi answers 200 with an `error` string for a spent plan or a bad key, so
 * a failure arrives looking like a success with no jobs in it. That is exactly
 * the shape that made an exhausted RapidAPI quota look like a slow network for
 * hours, so it is read and thrown rather than returned as an empty page.
 */
describe("extractSerpApiJobs", () => {
  it("throws on an error delivered with a 200", () => {
    expect(() => extractSerpApiJobs({ error: "Your account has run out of searches." }))
      .toThrow(/run out of searches/);
  });

  it("returns the jobs when there are jobs", () => {
    expect(extractSerpApiJobs({ jobs_results: [advert] })).toHaveLength(1);
  });

  it("treats a genuinely empty market as empty, not as a fault", () => {
    expect(extractSerpApiJobs({ jobs_results: [] })).toEqual([]);
    expect(extractSerpApiJobs({})).toEqual([]);
    expect(extractSerpApiJobs(null)).toEqual([]);
  });
});

/*
 * Employment type as a real filter rather than a hint: read off what Google
 * says about each listing, after the results are back, where it costs the
 * query nothing.
 */
describe("keepScheduleTypes", () => {
  const job = (schedule?: string) => ({
    title: "Engagement Manager",
    description: "A role.",
    ...(schedule ? { detected_extensions: { schedule_type: schedule } } : {}),
  });

  it("keeps the listings matching what was asked for", () => {
    const kept = keepScheduleTypes([job("Full-time"), job("Contractor")], ["Full-time"]);
    expect(kept).toHaveLength(1);
    expect(kept[0].detected_extensions?.schedule_type).toBe("Full-time");
  });

  it("does not mind how the market spells it", () => {
    expect(keepScheduleTypes([job("Full time"), job("FULLTIME")], ["Full-time"])).toHaveLength(2);
  });

  /*
   * Most adverts say nothing about this, and dropping a job because its
   * listing omitted a field would throw away far more than the filter is
   * worth.
   */
  it("keeps a listing Google said nothing about", () => {
    expect(keepScheduleTypes([job()], ["Full-time"])).toHaveLength(1);
    expect(keepScheduleTypes([job("")], ["Full-time"])).toHaveLength(1);
  });

  it("keeps everything when nothing was selected", () => {
    expect(keepScheduleTypes([job("Contractor"), job("Full-time")], [])).toHaveLength(2);
  });

  it("takes several selections together", () => {
    expect(keepScheduleTypes([job("Full-time"), job("Contractor"), job("Internship")], ["Full-time", "Contract"])).toHaveLength(2);
  });

  it("ignores a selection it has no words for", () => {
    expect(keepScheduleTypes([job("Full-time")], ["Something else"])).toHaveLength(1);
  });
});

describe("isNoResultsMessage", () => {
  it("recognises Google's own way of saying a market has nothing", () => {
    expect(isNoResultsMessage("Google hasn't returned any results for this query.")).toBe(true);
    expect(isNoResultsMessage("No results found for this query")).toBe(true);
  });

  it("does not mistake a real refusal for an empty market", () => {
    expect(isNoResultsMessage("Invalid API key")).toBe(false);
    expect(isNoResultsMessage("Your account has run out of searches")).toBe(false);
  });
});

describe("extractSerpApiJobs on an empty market", () => {
  it("returns nothing rather than throwing, so the provider is not retired", () => {
    expect(extractSerpApiJobs({ error: "Google hasn't returned any results for this query." })).toEqual([]);
  });

  it("still throws on a refusal that a person has to fix", () => {
    expect(() => extractSerpApiJobs({ error: "Invalid API key" })).toThrow(/Invalid API key/);
  });
});

describe("buildSerpApiParams async flag", () => {
  it("is absent unless asked for", () => {
    expect(buildSerpApiParams({ keywords: "analyst", country: "sg" }, "k").get("async")).toBeNull();
  });

  it("is set when the search is to be submitted rather than waited on", () => {
    expect(buildSerpApiParams({ keywords: "analyst", country: "sg" }, "k", true).get("async")).toBe("true");
  });
});

describe("readSerpApiStatus", () => {
  it("reads a finished search", () => {
    expect(readSerpApiStatus({ search_metadata: { status: "Success" }, jobs_results: [] })).toBe("success");
  });

  it("reads one still running", () => {
    expect(readSerpApiStatus({ search_metadata: { status: "Processing" } })).toBe("processing");
  });

  it("reads a failed one", () => {
    expect(readSerpApiStatus({ search_metadata: { status: "Error" } })).toBe("error");
  });

  it("treats a refusal with no status as an error", () => {
    expect(readSerpApiStatus({ error: "Invalid API key" })).toBe("error");
  });

  it("treats an empty market as a finished search, not a broken one", () => {
    expect(readSerpApiStatus({ error: "Google hasn't returned any results for this query." })).toBe("success");
  });

  it("treats a body with no status at all as a synchronous answer already in hand", () => {
    expect(readSerpApiStatus({ jobs_results: [] })).toBe("success");
  });
});

describe("readSerpApiSearchId", () => {
  it("finds the ticket", () => {
    expect(readSerpApiSearchId({ search_metadata: { id: "68abc" } })).toBe("68abc");
  });

  it("returns nothing when there is none", () => {
    expect(readSerpApiSearchId({ search_metadata: {} })).toBeNull();
    expect(readSerpApiSearchId(null)).toBeNull();
  });
});

describe("pollDelayMs", () => {
  it("starts quickly, so a cached search is not made to wait", () => {
    expect(pollDelayMs(0)).toBe(400);
  });

  it("backs off", () => {
    expect(pollDelayMs(1)).toBe(800);
    expect(pollDelayMs(2)).toBe(1_600);
  });

  it("stops backing off, so a long search is still checked regularly", () => {
    expect(pollDelayMs(10)).toBe(4_000);
  });
});

/*
 * The submit-and-poll loop, run with no network and no clock.
 *
 * This is the part that had to change and the part nobody could see failing:
 * the old version held one socket open and every real query was aborted on it.
 * Driving it with an injected clock means the timing rules — when it gives up,
 * what it does with a result that arrives late — are assertions rather than
 * something to find out in production.
 */
describe("searchSerpApi", () => {
  const query = { keywords: "ServiceNow Delivery Director", country: "sg", timeoutMs: 20_000 };

  const listing = {
    title: "ServiceNow Delivery Director",
    company_name: "Acme",
    description: "Lead ServiceNow delivery across the region.",
    apply_options: [{ title: "LinkedIn", link: "https://linkedin.com/jobs/1" }],
  };

  /* A clock that only moves when the code under test waits on it. */
  function fakeClock() {
    let ms = 0;
    return {
      now: () => ms,
      wait: async (delay: number) => { ms += delay; },
      advance: (delay: number) => { ms += delay; },
    };
  }

  it("returns a result that SerpApi answered on the spot", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    const results = await searchSerpApi(query, {
      submit: async () => ({ id: null, body: { jobs_results: [listing] } }),
      collect: async () => { throw new Error("should not poll a search already answered"); },
      now: clock.now,
      wait: clock.wait,
    });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("ServiceNow Delivery Director");
  });

  it("polls until a submitted search finishes, then returns it", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    let reads = 0;
    const results = await searchSerpApi(query, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => {
        reads += 1;
        return reads < 3
          ? { search_metadata: { status: "Processing" } }
          : { search_metadata: { status: "Success" }, jobs_results: [listing] };
      },
      now: clock.now,
      wait: clock.wait,
    });
    expect(reads).toBe(3);
    expect(results).toHaveLength(1);
  });

  it("gives up inside the budget rather than overrunning it", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    await expect(searchSerpApi({ ...query, timeoutMs: 20_000 }, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => ({ search_metadata: { status: "Processing" } }),
      now: clock.now,
      wait: clock.wait,
    })).rejects.toThrow(/still working/i);
    /* The whole point: it stopped short of the budget, it did not blow through it. */
    expect(clock.now()).toBeLessThanOrEqual(20_000);
  });

  it("says a slow search is still running, not that it failed", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    const caught = await searchSerpApi(query, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => ({ search_metadata: { status: "Processing" } }),
      now: clock.now,
      wait: clock.wait,
    }).catch((error: Error) => error);

    expect((caught as Error).name).toBe("SerpApiStillRunningError");
    /* The fact worth telling somebody: the next run gets it free and fast. */
    expect((caught as Error).message).toMatch(/cache/i);
  });

  it("treats an empty market as an empty answer, not a provider failure", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    const results = await searchSerpApi(query, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => ({ error: "Google hasn't returned any results for this query." }),
      now: clock.now,
      wait: clock.wait,
    });
    expect(results).toEqual([]);
  });

  it("throws a refusal a person has to act on", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    await expect(searchSerpApi(query, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => ({ search_metadata: { status: "Error" }, error: "Invalid API key" }),
      now: clock.now,
      wait: clock.wait,
    })).rejects.toThrow(/Invalid API key/);
  });

  it("refuses to run without a key rather than calling out with none", async () => {
    delete process.env.SERPAPI_KEY;
    delete process.env.SERPAPI_API_KEY;
    await expect(searchSerpApi(query)).rejects.toThrow(/not configured/i);
  });

  it("applies the schedule filter to a polled result, as the synchronous path did", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    const results = await searchSerpApi({ ...query, employmentTypes: ["Full-time"] }, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => ({
        search_metadata: { status: "Success" },
        jobs_results: [
          { ...listing, detected_extensions: { schedule_type: "Full-time" } },
          { ...listing, title: "Intern", detected_extensions: { schedule_type: "Internship" } },
        ],
      }),
      now: clock.now,
      wait: clock.wait,
    });
    expect(results.map((item) => item.title)).toEqual(["ServiceNow Delivery Director"]);
  });
});

/*
 * The nine-second budget, which is the number the live measurements produced:
 * a query with listings answered in 3,020ms; one without was still running at
 * eighteen. The reserve has to leave a real share of that to poll in.
 */
describe("searchSerpApi under a nine-second budget", () => {
  function fakeClock() {
    let ms = 0;
    return { now: () => ms, wait: async (delay: number) => { ms += delay; } };
  }

  it("still answers a query that comes back in about three seconds", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    const results = await searchSerpApi({ keywords: "Engagement Manager", country: "sg", timeoutMs: 9_000 }, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => ({
        search_metadata: { status: "Success" },
        jobs_results: [{
          title: "Engagement Manager",
          company_name: "Oliver Wyman",
          description: "Lead client engagements across insurance and asset management.",
          apply_options: [{ title: "Oliver Wyman", link: "https://oliverwyman.com/jobs/1" }],
        }],
      }),
      now: clock.now,
      wait: clock.wait,
    });
    expect(results).toHaveLength(1);
    expect(clock.now()).toBeLessThan(3_000);
  });

  it("spends most of the budget polling rather than holding it in reserve", async () => {
    process.env.SERPAPI_KEY = "k1";
    const clock = fakeClock();
    await searchSerpApi({ keywords: "ServiceNow Delivery Director", country: "sg", timeoutMs: 9_000 }, {
      submit: async () => ({ id: "abc", body: null }),
      collect: async () => ({ search_metadata: { status: "Processing" } }),
      now: clock.now,
      wait: clock.wait,
    }).catch(() => undefined);

    /*
     * The reserve used to be half an eight-second archive read, which at this
     * budget gave a query five seconds to answer in and kept four back.
     */
    expect(clock.now()).toBeGreaterThan(7_000);
    expect(clock.now()).toBeLessThanOrEqual(9_000);
  });
});

/*
 * Where a card actually sends somebody.
 *
 * A real result sent a person to sensational-raindrop-6482af.netlify.app,
 * which answered "Site not found". Google lists every site carrying an advert
 * and many of those are scraper farms republishing onto free hosting; being
 * first in apply_options says nothing about being real.
 */
describe("chooseApplyUrl", () => {
  it("prefers the employer's own site over anything else", () => {
    expect(chooseApplyUrl({
      company_name: "Northgate Advisory",
      apply_options: [
        { title: "Netlify", link: "https://sensational-raindrop-6482af.netlify.app/?jobs=x" },
        { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/1" },
        { title: "Northgate Advisory", link: "https://northgateadvisory.com/careers/1" },
      ],
    })).toBe("https://northgateadvisory.com/careers/1");
  });

  it("prefers a real job board over a scraper mirror listed first", () => {
    expect(chooseApplyUrl({
      company_name: "Acme",
      apply_options: [
        { title: "Netlify", link: "https://sensational-raindrop-6482af.netlify.app/?jobs=x" },
        { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/1" },
      ],
    })).toBe("https://www.linkedin.com/jobs/view/1");
  });

  it("counts an applicant tracking system as the employer's front door", () => {
    expect(chooseApplyUrl({
      company_name: "Acme",
      apply_options: [
        { title: "Covj.blogspot.com", link: "https://covj.blogspot.com/2026/09/job.html" },
        { title: "Workday", link: "https://acme.wd3.myworkdayjobs.com/en-US/careers/job/1" },
      ],
    })).toBe("https://acme.wd3.myworkdayjobs.com/en-US/careers/job/1");
  });

  /*
   * Google's listing page opens on a real advert. A dead mirror does not, so
   * an unrecognised host is worth less than the page Google itself hosts.
   */
  it("falls back to Google's own listing before an unrecognised host", () => {
    expect(chooseApplyUrl({
      company_name: "Acme",
      share_link: "https://www.google.com/search?q=acme#job",
      apply_options: [
        { title: "Netlify", link: "https://sensational-raindrop-6482af.netlify.app/?jobs=x" },
      ],
    })).toBe("https://www.google.com/search?q=acme#job");
  });

  it("still uses an unrecognised host rather than showing nothing", () => {
    /* A card with no link is a tease; a long shot beats no shot. */
    expect(chooseApplyUrl({
      company_name: "Acme",
      apply_options: [{ title: "Somewhere", link: "https://jobs.example.org/1" }],
    })).toBe("https://jobs.example.org/1");
  });

  it("returns nothing when there is nowhere to send anybody", () => {
    expect(chooseApplyUrl({ company_name: "Acme" })).toBeNull();
    expect(chooseApplyUrl({ company_name: "Acme", apply_options: [] })).toBeNull();
  });

  it("ignores a malformed link rather than throwing on it", () => {
    expect(chooseApplyUrl({
      company_name: "Acme",
      apply_options: [
        { title: "Broken", link: "not a url" },
        { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/1" },
      ],
    })).toBe("https://www.linkedin.com/jobs/view/1");
  });

  it("does not match a two-letter employer against every host", () => {
    /* "AI" or "GE" inside a hostname would otherwise pick any link at all. */
    expect(chooseApplyUrl({
      company_name: "GE",
      apply_options: [
        { title: "Netlify", link: "https://raindrop.netlify.app/x" },
        { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/1" },
      ],
    })).toBe("https://www.linkedin.com/jobs/view/1");
  });
});
