import { describe, expect, it } from "vitest";
import { adzunaEmploymentParams, earlyCareerSelections, employmentQueryHints, isEmploymentType, jsearchEmploymentTypes } from "./employment-types";

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
