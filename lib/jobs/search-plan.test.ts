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

  it("adds a targeted query per company (capped) for the top role, country-wide", () => {
    const companyQueries = planSearchQueries(brief).filter((query) => query.employer);
    expect(companyQueries.map((query) => query.employer)).toEqual(["PwC", "Deloitte", "KPMG", "Accenture"]);
    expect(companyQueries.every((query) => query.keywords === "Business Analyst" && query.location === undefined)).toBe(true);
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
