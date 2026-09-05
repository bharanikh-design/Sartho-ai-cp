import { describe, expect, it } from "vitest";
import { adzunaEmploymentParams, employmentQueryHints, isEmploymentType, jsearchEmploymentTypes } from "./employment-types";

describe("employment types", () => {
  it("reaches each provider in that provider's own language", () => {
    expect(jsearchEmploymentTypes(["Full-time", "Contract"])).toBe("FULLTIME,CONTRACTOR");
    expect(adzunaEmploymentParams(["Full-time", "Part-time"])).toEqual(["full_time", "part_time"]);
  });

  it("falls back to a query hint only where neither provider can filter", () => {
    // Internship is a real JSearch filter, so it must not also be a hint.
    expect(employmentQueryHints(["Internship"])).toEqual([]);
    expect(employmentQueryHints(["Graduate programme"])).toEqual(["graduate program"]);
  });

  it("sends nothing when nothing is chosen", () => {
    expect(jsearchEmploymentTypes([])).toBeNull();
    expect(adzunaEmploymentParams([])).toEqual([]);
  });

  it("rejects a type it does not know", () => {
    expect(isEmploymentType("Full-time")).toBe(true);
    expect(isEmploymentType("Whenever I feel like it")).toBe(false);
  });
});
