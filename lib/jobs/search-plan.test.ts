import { describe, expect, it } from "vitest";
import { planSearchQueries, toSearchKeywords } from "@/lib/jobs/search-plan";

describe("toSearchKeywords", () => {
  it("reduces a person's phrasing to the primary title", () => {
    expect(toSearchKeywords("Business Analyst / Junior Consultant")).toBe("Business Analyst");
    expect(toSearchKeywords("Risk & Cybersecurity Analyst (Graduate)")).toBe("Risk Cybersecurity Analyst");
    expect(toSearchKeywords("Senior Product Manager Payments Platform Lead")).toBe("Senior Product Manager Payments");
  });
});

describe("planSearchQueries", () => {
  const brief = {
    roles: ["Business Analyst / Junior Consultant", "Data Analyst", "Risk Analyst", "Fourth Role"],
    country: "au",
    locations: ["Sydney", "Melbourne"],
    companies: ["PwC", "Deloitte", "KPMG", "Accenture", "BCG"],
    remotePreference: "Hybrid",
  };

  it("scopes every query to the person's country", () => {
    const queries = planSearchQueries(brief);
    expect(queries.every((query) => query.country === "au")).toBe(true);
  });

  it("runs one query per priority role (capped) with the first city", () => {
    const roleQueries = planSearchQueries(brief).filter((query) => !query.employer);
    expect(roleQueries.map((query) => query.keywords)).toEqual(["Business Analyst", "Data Analyst", "Risk Analyst"]);
    expect(roleQueries.every((query) => query.location === "Sydney")).toBe(true);
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
});
