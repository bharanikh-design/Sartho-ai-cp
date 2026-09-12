import { afterEach, describe, expect, it } from "vitest";
import { keepScheduleTypes, buildSerpApiParams, extractSerpApiJobs, mapSerpApiResult, readSerpApiPlatforms, serpApiConfig } from "./serpapi";

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
