import { describe, expect, it } from "vitest";
import { EMPLOYMENT_TYPES, adzunaEmploymentParams, canFilter, earlyCareerSelections, employmentQueryHints, employmentType, filterableSelections, isEmploymentType, jsearchEmploymentTypes } from "./employment-types";

describe("employment types", () => {
  it("reaches each provider in that provider's own language", () => {
    expect(jsearchEmploymentTypes(["Full-time", "Contract"])).toBe("FULLTIME,CONTRACTOR");
    expect(adzunaEmploymentParams(["Full-time", "Part-time"])).toEqual(["full_time", "part_time"]);
  });

  /*
   * Hints used to be computed "where neither provider can filter", which threw
   * selections away: Internship has a JSearch filter, so it was excluded from
   * the hints — and on an Adzuna-only search, which is what actually runs,
   * Adzuna has no internship parameter and never saw the word either.
   */
  it("hints for what THIS provider cannot filter", () => {
    expect(employmentQueryHints(["Internship"], "adzuna")).toEqual(["internship"]);
    expect(employmentQueryHints(["Internship"], "jsearch")).toEqual([]);
    expect(employmentQueryHints(["Permanent"], "adzuna")).toEqual([]);
    expect(employmentQueryHints(["Permanent"], "jsearch")).toEqual(["permanent"]);
    expect(employmentQueryHints(["Graduate programme"], "adzuna")).toEqual(["graduate program"]);
    expect(employmentQueryHints(["Graduate programme"], "jsearch")).toEqual(["graduate program"]);
  });

  it("names the early-career selections that need their own pass", () => {
    expect(earlyCareerSelections(["Full-time", "Internship", "Graduate programme"]))
      .toEqual(["Internship", "Graduate programme"]);
    expect(earlyCareerSelections(["Full-time", "Permanent"])).toEqual([]);
  });

  it("sends nothing when nothing is chosen", () => {
    expect(jsearchEmploymentTypes([])).toBeNull();
    expect(adzunaEmploymentParams([])).toEqual([]);
    expect(employmentQueryHints([], "adzuna")).toEqual([]);
  });

  it("rejects a type it does not know", () => {
    expect(isEmploymentType("Full-time")).toBe(true);
    expect(isEmploymentType("Whenever I feel like it")).toBe(false);
  });

  it("omits mutually exclusive contract and permanent flags to prevent Adzuna 400", () => {
    expect(adzunaEmploymentParams(["Contract", "Permanent"])).toEqual([]);
    expect(adzunaEmploymentParams(["Full-time", "Contract", "Permanent"])).toEqual(["full_time"]);
    expect(adzunaEmploymentParams(["Contract"])).toEqual(["contract"]);
    expect(adzunaEmploymentParams(["Permanent"])).toEqual(["permanent"]);
  });
});

/*
 * SerpApi cannot filter employment type, and the claim that it could cost a
 * whole search: a hand-built `employment_type:FULLTIME` chip returned nothing
 * from Google, on every filtered search, while the unfiltered probe kept
 * reporting the provider healthy.
 */
describe("what SerpApi can actually narrow", () => {
  const fullTime = employmentType("Full-time")!;
  const internship = employmentType("Internship")!;

  it("never claims to filter, whatever the type", () => {
    for (const type of EMPLOYMENT_TYPES) {
      expect(canFilter(type, "serpapi")).toBe(false);
    }
  });

  it("sends every selection through as a query hint instead", () => {
    expect(employmentQueryHints(["Full-time", "Internship"], "serpapi")).toEqual(["full time", "internship"]);
  });

  /* The other two are unchanged: this was a SerpApi mistake, not a shared one. */
  it("leaves Adzuna and JSearch filtering as they were", () => {
    expect(canFilter(fullTime, "adzuna")).toBe(true);
    expect(canFilter(fullTime, "jsearch")).toBe(true);
    expect(canFilter(internship, "jsearch")).toBe(true);
    expect(canFilter(internship, "adzuna")).toBe(false);
  });

  it("reports nothing as filterable on SerpApi", () => {
    expect(filterableSelections(["Full-time", "Contract"], "serpapi")).toEqual([]);
  });
});
