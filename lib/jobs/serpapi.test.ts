import { afterEach, describe, expect, it } from "vitest";
import { buildSerpApiParams, extractSerpApiJobs, mapSerpApiResult, readSerpApiPlatforms, serpApiConfig } from "./serpapi";

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

  it("filters employment type through Google's chips", () => {
    const params = buildSerpApiParams(
      { keywords: "Engagement Manager", country: "sg", employmentTypes: ["Full-time"] },
      "key",
    );
    expect(params.get("chips")).toContain("employment_type:FULLTIME");
  });

  /* A full-time filter and a request for internships cancel each other out. */
  it("drops the type filter on the early-career pass", () => {
    const params = buildSerpApiParams(
      { keywords: "Analyst", country: "sg", employmentTypes: ["Full-time"], earlyCareerOnly: true },
      "key",
    );
    expect(params.get("chips")).toBeNull();
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
