import { describe, expect, it } from "vitest";
import { knownEmployer, splitMisfiledCompanies } from "./employers";

describe("employers", () => {
  it("recognises known employers and aliases regardless of case", () => {
    expect(knownEmployer("pWC")).toBe("PwC");
    expect(knownEmployer("BCG")).toBe("Boston Consulting Group");
    expect(knownEmployer("deloitte")).toBe("Deloitte");
    expect(knownEmployer("Sydney")).toBeNull();
  });

  it("moves employers typed into the cities list across to companies", () => {
    const result = splitMisfiledCompanies(["Sydney", "pWC", "Deloitte", "BCG"], ["Deloitte"]);
    expect(result.locations).toEqual(["Sydney"]);
    expect(result.companies).toEqual(["Deloitte", "PwC", "Boston Consulting Group"]);
    expect(result.moved).toBe(3);
  });
});
