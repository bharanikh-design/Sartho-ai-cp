import { describe, expect, it } from "vitest";
import { planSearchQueries, toSearchKeywords, widenToCountry } from "@/lib/jobs/search-plan";

describe("toSearchKeywords", () => {
  it("reduces a person's phrasing to the primary title", () => {
    expect(toSearchKeywords("Business Analyst / Junior Consultant")).toBe("Business Analyst");
    expect(toSearchKeywords("Senior Product Manager Payments Platform Lead")).toBe("Product Manager");
  });

  /*
   * This assertion used to read "Risk Cybersecurity Analyst" — the composite
   * verbatim. No employer posts that, so the provider returned almost nothing,
   * and a three-role search came back with two survivors. The real title inside
   * the phrase is what gets searched now.
   */
  it("searches the market title inside a composite, not the composite", () => {
    expect(toSearchKeywords("Risk & Cybersecurity Analyst (Graduate)")).toBe("Cybersecurity Analyst");
    expect(toSearchKeywords("Strategy Operations Analyst")).toBe("Operations Analyst");
    expect(toSearchKeywords("Management Consultant")).toBe("Management Consultant");
  });

  it("falls back to trimming when no market title is recognisable", () => {
    expect(toSearchKeywords("Chief Vibes Officer (Remote)")).toBe("Chief Vibes Officer");
  });
});

describe("planSearchQueries", () => {
  const brief = {
    roles: ["Business Analyst / Junior Consultant", "Data Analyst", "Risk Analyst", "Fourth Role"],
    country: "au",
    locations: ["Sydney", "Melbourne", "Brisbane"],
    companies: ["PwC", "Deloitte", "KPMG", "Accenture", "BCG"],
    remotePreference: "Hybrid",
  };

  it("scopes every query to the person's country", () => {
    const queries = planSearchQueries(brief);
    expect(queries.every((query) => query.country === "au")).toBe(true);
  });

  it("searches the top role in the first two cities and the other roles in the first", () => {
    const roleQueries = planSearchQueries(brief).filter((query) => !query.employer);
    expect(roleQueries.map((query) => [query.keywords, query.location])).toEqual([
      ["Business Analyst", "Sydney"],
      ["Business Analyst", "Melbourne"],
      ["Data Analyst", "Sydney"],
      ["Risk Analyst", "Sydney"],
    ]);
  });

  /*
   * This used to assert a cap of four employers against the top role only. Nine
   * selected employers meant five were never queried, and the criteria line
   * still read "companies: PwC, KPMG, Deloitte, EY" as if that were the list.
   */
  it("searches every employer, against the top two roles, country-wide", () => {
    const companyQueries = planSearchQueries(brief).filter((query) => query.employer);
    expect([...new Set(companyQueries.map((query) => query.employer))])
      .toEqual(["PwC", "Deloitte", "KPMG", "Accenture", "BCG"]);
    expect([...new Set(companyQueries.map((query) => query.keywords))])
      .toEqual(["Business Analyst", "Data Analyst"]);
    expect(companyQueries.every((query) => query.location === undefined)).toBe(true);
  });

  /*
   * Adzuna ANDs full_time and permanent, which excludes exactly the internships
   * and graduate programmes selected beside them. Those get their own pass with
   * the conflicting flags dropped.
   */
  it("adds an early-career pass when internships or graduate roles are wanted", () => {
    const withEarly = planSearchQueries({
      ...brief,
      companies: [],
      employmentTypes: ["Full-time", "Permanent", "Internship", "Graduate programme"],
    });
    const early = withEarly.filter((query) => query.earlyCareerOnly);
    expect(early.map((query) => query.keywords)).toEqual(["Business Analyst", "Data Analyst"]);

    const withoutEarly = planSearchQueries({
      ...brief,
      companies: [],
      employmentTypes: ["Full-time", "Permanent"],
    });
    expect(withoutEarly.some((query) => query.earlyCareerOnly)).toBe(false);
  });

  /*
   * Type of work and years of experience are different questions, and requiring
   * the first to get graduate postings is a trap for exactly the person who
   * most needs them. Somebody in their first year gets the pass either way.
   */
  it("adds the early-career pass for a graduate who ticked no employment type", () => {
    const queries = planSearchQueries({
      ...brief,
      companies: [],
      employmentTypes: [],
      entryLevelTerms: ["graduate program", "entry level"],
    });
    const early = queries.filter((query) => query.earlyCareerOnly);
    expect(early.map((query) => query.keywords)).toEqual(["Business Analyst", "Data Analyst"]);
    expect(early[0].entryLevelTerms).toEqual(["graduate program", "entry level"]);
  });

  it("adds early-career cohort queries for target companies", () => {
    const queries = planSearchQueries({
      ...brief,
      entryLevelTerms: ["graduate program", "vacationer"],
    });
    const earlyCompanyQueries = queries.filter((q) => q.earlyCareerOnly && q.employer);
    expect(earlyCompanyQueries.map((q) => q.employer)).toEqual(["PwC", "Deloitte", "KPMG", "Accenture", "BCG"]);
    expect(earlyCompanyQueries.every((q) => q.keywords === "graduate program")).toBe(true);
  });

  it("does not add the pass for somebody who is not early career", () => {
    const queries = planSearchQueries({ ...brief, companies: [], employmentTypes: [], entryLevelTerms: [] });
    expect(queries.some((query) => query.earlyCareerOnly)).toBe(false);
  });

  it("searches the whole country when no city is set", () => {
    const queries = planSearchQueries({ ...brief, locations: [], companies: [] });
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.location === undefined)).toBe(true);
  });

  it("asks for remote-only listings when the work model is Remote", () => {
    expect(planSearchQueries({ ...brief, remotePreference: "Remote" }).every((query) => query.remoteOnly)).toBe(true);
    expect(planSearchQueries(brief).some((query) => query.remoteOnly)).toBe(false);
  });

  it("plans nothing without a target role", () => {
    expect(planSearchQueries({ ...brief, roles: [] })).toEqual([]);
  });
});

describe("widenToCountry", () => {
  it("re-runs each role once with no city and leaves company queries alone", () => {
    const widened = widenToCountry(planSearchQueries({
      roles: ["Business Analyst", "Data Analyst"],
      country: "au",
      locations: ["Sydney", "Melbourne"],
      companies: ["PwC"],
      remotePreference: "Flexible",
    }));
    expect(widened.map((query) => query.keywords)).toEqual(["Business Analyst", "Data Analyst"]);
    expect(widened.every((query) => query.location === undefined && !query.employer && query.country === "au")).toBe(true);
  });

  it("has nothing to widen when the brief was already nationwide", () => {
    expect(widenToCountry(planSearchQueries({ roles: ["BA"], country: "in", locations: [], companies: [], remotePreference: null }))).toEqual([]);
  });
});
