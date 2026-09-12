import { afterEach, describe, expect, it } from "vitest";
import {
  adzunaCoversCountry,
  configuredJobSearchProviders,
  buildAdzunaUrl,
  buildJSearchParams,
  extractJSearchJobs,
  jsearchPages,
  mapAdzunaResult,
  mapJSearchResult,
  normaliseAdzunaCountry,
  providersForCountry,
} from "./search-provider";

describe("normaliseAdzunaCountry", () => {
  it("takes the first of a comma list and lowercases it", () => {
    expect(normaliseAdzunaCountry("AU,SG,UK")).toBe("au");
    expect(normaliseAdzunaCountry("au, sg")).toBe("au");
  });
  it("maps uk to gb and keeps valid codes", () => {
    expect(normaliseAdzunaCountry("uk")).toBe("gb");
    expect(normaliseAdzunaCountry("sg")).toBe("sg");
  });
  it("falls back to gb for empty or unsupported values", () => {
    expect(normaliseAdzunaCountry(undefined)).toBe("gb");
    expect(normaliseAdzunaCountry("narnia")).toBe("gb");
  });
});

describe("mapAdzunaResult", () => {
  it("maps a complete Adzuna record into Sartho's shape", () => {
    const result = mapAdzunaResult({
      title: "  Senior Engagement Manager  ",
      company: { display_name: "Example Corp" },
      location: { display_name: "Sydney" },
      description: "Lead client engagements across the region.",
      redirect_url: "https://www.adzuna.com/land/ad/123",
      salary_min: 120000,
      salary_max: 150000,
      created: "2026-09-01T00:00:00Z",
    });

    expect(result).toEqual({
      title: "Senior Engagement Manager",
      employer: "Example Corp",
      location: "Sydney",
      description: "Lead client engagements across the region.",
      url: "https://www.adzuna.com/land/ad/123",
      salary: "120,000–150,000",
      postedAt: "2026-09-01T00:00:00Z",
      source: "Adzuna",
      /* Adzuna's search response names no other board, so none is claimed. */
      platforms: [],
      applyDirect: false,
    });
  });

  it("drops a record missing a title, link or description", () => {
    expect(mapAdzunaResult({ company: { display_name: "X" }, description: "d", redirect_url: "https://x" })).toBeNull();
    expect(mapAdzunaResult({ title: "T", description: "d" })).toBeNull();
    expect(mapAdzunaResult({ title: "T", redirect_url: "https://x" })).toBeNull();
  });

  it("leaves optional fields null and omits an absent salary", () => {
    const result = mapAdzunaResult({
      title: "Analyst",
      description: "Do the analysis.",
      redirect_url: "https://x/1",
    });
    expect(result?.employer).toBeNull();
    expect(result?.location).toBeNull();
    expect(result?.salary).toBeNull();
    expect(result?.postedAt).toBeNull();
  });
});

describe("mapJSearchResult", () => {
  it("maps a Google-for-Jobs record and joins the location parts", () => {
    const result = mapJSearchResult({
      job_title: "Business Analyst",
      employer_name: "Deloitte",
      job_description: "Deliver analysis for consulting engagements.",
      job_apply_link: "https://deloitte.com/careers/123",
      job_city: "Sydney",
      job_state: "NSW",
      job_country: "AU",
      job_posted_at_datetime_utc: "2026-09-01T00:00:00Z",
      job_min_salary: 90000,
      job_max_salary: 110000,
    });

    expect(result).toEqual({
      title: "Business Analyst",
      employer: "Deloitte",
      location: "Sydney, NSW, AU",
      description: "Deliver analysis for consulting engagements.",
      url: "https://deloitte.com/careers/123",
      salary: "90,000–110,000",
      platforms: [],
      applyDirect: false,
      postedAt: "2026-09-01T00:00:00Z",
      source: "Google for Jobs",
    });
  });

  it("drops a record missing a title, link or description", () => {
    expect(mapJSearchResult({ employer_name: "X", job_description: "d", job_apply_link: "https://x" })).toBeNull();
    expect(mapJSearchResult({ job_title: "T", job_apply_link: "https://x" })).toBeNull();
  });
});

/*
 * Google for Jobs is an index, not a board: it finds the same advert on
 * LinkedIn, on Indeed and on the employer's own site, and names each one. Both
 * fields carrying that were being discarded, which is why Sartho could never
 * say "this is also on LinkedIn".
 */
describe("readPlatforms", () => {
  const advert = {
    job_title: "Graduate Analyst",
    job_description: "Join our 2027 graduate programme.",
    job_apply_link: "https://careers.example.com/1",
  };

  it("names every board carrying the advert", () => {
    const result = mapJSearchResult({
      ...advert,
      job_publisher: "LinkedIn",
      apply_options: [
        { publisher: "LinkedIn", apply_link: "https://linkedin.com/jobs/1" },
        { publisher: "Indeed", apply_link: "https://indeed.com/1" },
        { publisher: "Example Corp", apply_link: "https://careers.example.com/1", is_direct: true },
      ],
    });
    expect(result?.platforms).toEqual(["LinkedIn", "Indeed", "Example Corp"]);
  });

  /*
   * Applying on the employer's own site usually beats an aggregator, whose
   * form is a second copy of your details a recruiter may never open. Worth
   * telling somebody deciding where to spend twenty minutes.
   */
  it("says when one of them is the employer itself", () => {
    expect(mapJSearchResult({
      ...advert,
      apply_options: [{ publisher: "Example Corp", is_direct: true }],
    })?.applyDirect).toBe(true);

    expect(mapJSearchResult({
      ...advert,
      apply_options: [{ publisher: "Indeed", is_direct: false }],
    })?.applyDirect).toBe(false);
  });

  it("treats one board named twice as one board", () => {
    const result = mapJSearchResult({
      ...advert,
      job_publisher: "LinkedIn",
      apply_options: [{ publisher: "linkedin" }, { publisher: "LinkedIn" }, { publisher: "Indeed" }],
    });
    expect(result?.platforms).toEqual(["LinkedIn", "Indeed"]);
  });

  it("caps the list rather than printing a paragraph of boards", () => {
    const result = mapJSearchResult({
      ...advert,
      apply_options: Array.from({ length: 12 }, (_, index) => ({ publisher: `Board ${index}` })),
    });
    expect(result?.platforms).toHaveLength(5);
  });

  it("claims nothing when the provider named nothing", () => {
    const result = mapJSearchResult(advert);
    expect(result?.platforms).toEqual([]);
    expect(result?.applyDirect).toBe(false);
  });

  it("ignores junk a provider might send", () => {
    const result = mapJSearchResult({
      ...advert,
      job_publisher: "   ",
      // @ts-expect-error deliberately wrong: this is a third party's JSON
      apply_options: [{ publisher: null }, { publisher: 42 }, { publisher: "x".repeat(80) }, { publisher: "Seek" }],
    });
    expect(result?.platforms).toEqual(["Seek"]);
  });

  /*
   * The provenance line stays "Google for Jobs" — where Sartho looked — and the
   * boards are a separate claim. Collapsing them would make the criteria line
   * say Sartho queried LinkedIn, which it did not.
   */
  it("keeps where Sartho looked apart from where the advert lives", () => {
    const result = mapJSearchResult({ ...advert, job_publisher: "LinkedIn" });
    expect(result?.source).toBe("Google for Jobs");
    expect(result?.platforms).toEqual(["LinkedIn"]);
  });
});

describe("country-aware provider selection", () => {
  it("keeps JSearch for any market and Adzuna only where it has an endpoint", () => {
    expect(providersForCountry("au", ["jsearch", "adzuna"])).toEqual(["jsearch", "adzuna"]);
    expect(providersForCountry("ae", ["jsearch", "adzuna"])).toEqual(["jsearch"]);
    expect(providersForCountry("ae", ["adzuna"])).toEqual([]);
    expect(adzunaCoversCountry("IN")).toBe(true);
    expect(adzunaCoversCountry("hk")).toBe(false);
  });
});

describe("query → provider request mapping", () => {
  const credentials = { appId: "id", appKey: "key" };

  /*
   * The employer moved out of its own parameter and into `what`.
   *
   * This asserted `company=PwC`, which is not one of Adzuna's documented search
   * parameters — those are what, what_and, what_or, what_exclude, title_only,
   * where, distance, the employment-type flags, salary bounds, category,
   * max_days_old, sort_by and results_per_page. Live searches began returning
   * "Adzuna search failed (400)" in the same run that employer queries first
   * ran early enough to survive the time budget, having previously always been
   * skipped. The response body is now reported too, so the next 400 names its
   * own cause rather than leaving this to inference.
   */
  it("puts the country in Adzuna's path, the city in where, and the employer in what", () => {
    const url = new URL(buildAdzunaUrl({ keywords: "Business Analyst", country: "au", location: "Sydney", employer: "PwC" }, credentials));
    expect(url.pathname).toBe("/v1/api/jobs/au/search/1");
    expect(url.searchParams.get("what")).toBe("Business Analyst PwC");
    expect(url.searchParams.get("where")).toBe("Sydney");
    expect(url.searchParams.get("company")).toBeNull();
  });

  /*
   * `what` ANDs its terms. Appending "graduate scheme fresher new grad" there
   * would demand an advert containing all of them, which is no advert at all —
   * so the market's words for a graduate role go in `what_or`, and the role
   * stays in `what`.
   */
  it("sends entry-level wording as alternatives, not as extra required words", () => {
    const url = new URL(buildAdzunaUrl({
      keywords: "Business Analyst",
      country: "au",
      earlyCareerOnly: true,
      entryLevelTerms: ["graduate program", "entry level"],
    }, credentials));
    expect(url.searchParams.get("what")).toBe("Business Analyst");
    expect(url.searchParams.get("what_or")).toBe("graduate program entry level");
  });

  it("does not colour an ordinary search with entry-level wording", () => {
    const url = new URL(buildAdzunaUrl({
      keywords: "Business Analyst",
      country: "au",
      entryLevelTerms: ["graduate program"],
    }, credentials));
    expect(url.searchParams.get("what_or")).toBeNull();
  });

  it("embeds employer and city in JSearch's free-text query and scopes by country", () => {
    const params = buildJSearchParams({ keywords: "Business Analyst", country: "au", location: "Sydney", employer: "PwC", remoteOnly: true });
    expect(params.get("query")).toBe("Business Analyst at PwC in Sydney");
    expect(params.get("country")).toBe("au");
    expect(params.get("work_from_home")).toBe("true");
    expect(buildJSearchParams({ keywords: "Data Analyst", country: "in" }).get("query")).toBe("Data Analyst in India");
  });
});

describe("extractJSearchJobs", () => {
  const sampleJob = {
    job_title: "Graduate Banking Analyst",
    employer_name: "Deloitte",
    job_description: "Join our consulting practice.",
    job_apply_link: "https://deloitte.example.com/apply/1",
  };

  it("extracts jobs from canonical { status: 'OK', data: [...] } structure", () => {
    const jobs = extractJSearchJobs({ status: "OK", data: [sampleJob] });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.job_title).toBe("Graduate Banking Analyst");
  });

  it("extracts jobs when response body is directly an array", () => {
    const jobs = extractJSearchJobs([sampleJob]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.job_title).toBe("Graduate Banking Analyst");
  });

  it("extracts jobs when nested under data.jobs", () => {
    const jobs = extractJSearchJobs({ status: "OK", data: { jobs: [sampleJob] } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.job_title).toBe("Graduate Banking Analyst");
  });

  it("extracts jobs when nested under data.results", () => {
    const jobs = extractJSearchJobs({ status: "OK", data: { results: [sampleJob] } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.job_title).toBe("Graduate Banking Analyst");
  });

  it("extracts jobs when top-level results array is present", () => {
    const jobs = extractJSearchJobs({ results: [sampleJob] });
    expect(jobs).toHaveLength(1);
  });

  it("safely returns an empty array when data is an empty dictionary {} without throwing", () => {
    // This exact payload threw '((intermediate value).data ?? []).map is not a function' in production
    const jobs = extractJSearchJobs({ status: "OK", request_id: "abc", data: {} });
    expect(jobs).toEqual([]);
  });

  it("safely returns an empty array for empty, null or primitive inputs", () => {
    expect(extractJSearchJobs(null)).toEqual([]);
    expect(extractJSearchJobs(undefined)).toEqual([]);
    expect(extractJSearchJobs({})).toEqual([]);
    expect(extractJSearchJobs({ data: null })).toEqual([]);
    expect(extractJSearchJobs("string")).toEqual([]);
  });

  it("throws descriptive error when status is ERROR with error.message", () => {
    expect(() =>
      extractJSearchJobs({
        status: "ERROR",
        error: { message: "You have exceeded the MONTHLY quota for Requests on your current plan." },
      }),
    ).toThrow("You have exceeded the MONTHLY quota for Requests on your current plan.");
  });

  it("throws descriptive error when status is ERROR with top-level message", () => {
    expect(() =>
      extractJSearchJobs({
        status: "ERROR",
        message: "Invalid query parameter: date_posted",
      }),
    ).toThrow("Invalid query parameter: date_posted");
  });

  it("throws descriptive error when nested data contains an error string", () => {
    expect(() =>
      extractJSearchJobs({
        status: "ERROR",
        data: { error: "Access forbidden" },
      }),
    ).toThrow("Access forbidden");
  });
});

/*
 * `limit` was accepted on every query and then dropped here, so a query asking
 * for 20 roles got JSearch's default single page of ten however it was written.
 * The ceiling stays an environment setting because it is a billing question:
 * num_pages above 1 is a paid RapidAPI feature, and a free-tier deployment
 * asking for two gets an error instead of more jobs.
 */
describe("JSearch paging", () => {
  afterEach(() => {
    delete process.env.JSEARCH_MAX_PAGES;
  });

  it("asks for one page by default, whatever the query wanted", () => {
    delete process.env.JSEARCH_MAX_PAGES;
    expect(jsearchPages(20)).toBe(1);
    expect(jsearchPages(undefined)).toBe(1);
  });

  it("buys the depth a paid plan allows, without exceeding what was asked for", () => {
    process.env.JSEARCH_MAX_PAGES = "5";
    expect(jsearchPages(20)).toBe(2);
    expect(jsearchPages(10)).toBe(1);
    expect(jsearchPages(100)).toBe(5);
  });

  it("never asks for less than one page, or more than the API allows", () => {
    process.env.JSEARCH_MAX_PAGES = "0";
    expect(jsearchPages(20)).toBe(1);
    process.env.JSEARCH_MAX_PAGES = "999";
    expect(jsearchPages(1000)).toBe(20);
    process.env.JSEARCH_MAX_PAGES = "nonsense";
    expect(jsearchPages(50)).toBe(1);
  });

  it("carries the page count into the request", () => {
    process.env.JSEARCH_MAX_PAGES = "3";
    const params = buildJSearchParams({ keywords: "Engagement Manager", country: "sg", limit: 30 });
    expect(params.get("num_pages")).toBe("3");
  });
});

/*
 * Adzuna's documented search parameters are what, what_and, what_or,
 * what_exclude, title_only, where, distance, the employment-type flags, salary
 * bounds, category, max_days_old, sort_by and results_per_page. `company` is
 * not among them, and sending it answered 400 — invisible for as long as
 * employer queries sat last in the plan and were skipped by the time budget.
 */
describe("Adzuna employer queries", () => {
  const credentials = { appId: "ID", appKey: "KEY" };
  const employerQuery = { keywords: "Engagement Manager", country: "sg", employer: "Accenture", limit: 10 };

  it("never sends a company parameter", () => {
    const url = new URL(buildAdzunaUrl(employerQuery, credentials));
    expect(url.searchParams.get("company")).toBeNull();
  });

  it("puts the employer in the search text, where Adzuna reads it", () => {
    const url = new URL(buildAdzunaUrl(employerQuery, credentials));
    expect(url.searchParams.get("what")).toBe("Engagement Manager Accenture");
  });

  it("leaves an ordinary query alone", () => {
    const url = new URL(buildAdzunaUrl({ keywords: "Practice Lead", country: "sg" }, credentials));
    expect(url.searchParams.get("what")).toBe("Practice Lead");
    expect(url.searchParams.get("company")).toBeNull();
  });

  /* Both providers should describe an employer search the same way. */
  it("agrees with how JSearch folds an employer into its query", () => {
    expect(buildJSearchParams(employerQuery).get("query")).toContain("Accenture");
    expect(new URL(buildAdzunaUrl(employerQuery, credentials)).searchParams.get("what")).toContain("Accenture");
  });
});

/*
 * A provider can stop answering while its key stays perfectly valid, and then
 * it is not neutral — it is a cost. A SerpApi that never returns still takes
 * its full twenty seconds out of a seventy-five second budget before anything
 * else is asked, which measurably left twenty-one of twenty-five queries unrun.
 */
describe("turning a provider off without deleting its key", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  function configure() {
    process.env.SERPAPI_KEY = "serp";
    process.env.JSEARCH_RAPIDAPI_KEY = "rapid";
    process.env.ADZUNA_APP_ID = "id";
    process.env.ADZUNA_APP_KEY = "key";
  }

  it("leaves the order alone when nothing is disabled", () => {
    configure();
    delete process.env.JOBS_DISABLED_PROVIDERS;
    expect(configuredJobSearchProviders()).toEqual(["serpapi", "jsearch", "adzuna"]);
  });

  it("drops the named provider and keeps its key", () => {
    configure();
    process.env.JOBS_DISABLED_PROVIDERS = "serpapi";
    expect(configuredJobSearchProviders()).toEqual(["jsearch", "adzuna"]);
    expect(process.env.SERPAPI_KEY).toBe("serp");
  });

  it("takes several, comma or space separated", () => {
    configure();
    process.env.JOBS_DISABLED_PROVIDERS = "serpapi, jsearch";
    expect(configuredJobSearchProviders()).toEqual(["adzuna"]);
    process.env.JOBS_DISABLED_PROVIDERS = "serpapi jsearch";
    expect(configuredJobSearchProviders()).toEqual(["adzuna"]);
  });

  it("does not mind casing or stray whitespace", () => {
    configure();
    process.env.JOBS_DISABLED_PROVIDERS = "  SerpApi  ";
    expect(configuredJobSearchProviders()).toEqual(["jsearch", "adzuna"]);
  });

  /*
   * Search going dark because of a typo in an environment variable is worse
   * than one slow provider, so disabling everything is read as the mistake it
   * is rather than obeyed.
   */
  it("refuses to disable every provider", () => {
    configure();
    process.env.JOBS_DISABLED_PROVIDERS = "serpapi,jsearch,adzuna";
    expect(configuredJobSearchProviders()).toEqual(["serpapi", "jsearch", "adzuna"]);
  });

  it("ignores a name that is not a provider", () => {
    configure();
    process.env.JOBS_DISABLED_PROVIDERS = "linkedin";
    expect(configuredJobSearchProviders()).toEqual(["serpapi", "jsearch", "adzuna"]);
  });

  /* A pin to a disabled provider is ignored rather than resurrecting it. */
  it("does not let the pin override the disable", () => {
    configure();
    process.env.JOBS_DISABLED_PROVIDERS = "serpapi";
    process.env.JOBS_SEARCH_PROVIDER = "serpapi";
    expect(configuredJobSearchProviders()).toEqual(["jsearch", "adzuna"]);
  });
});
