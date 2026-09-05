import { describe, expect, it } from "vitest";
import { candidateSeniority, scoreTitleFit, seniorityOf, titleSubject } from "./title-fit";

describe("seniorityOf", () => {
  it("reads the level from the words a title uses", () => {
    expect(seniorityOf("Graduate Analyst")).toBe(0);
    expect(seniorityOf("Junior Business Analyst")).toBe(1);
    expect(seniorityOf("Business Analyst")).toBe(2);
    expect(seniorityOf("Senior Business Analyst")).toBe(3);
    expect(seniorityOf("Engagement Manager")).toBe(4);
    expect(seniorityOf("Head of Transformation")).toBe(5);
  });
});

describe("titleSubject", () => {
  it("strips seniority and job-advert boilerplate", () => {
    expect(titleSubject("Senior Business Analyst (Full Time, Remote)")).toEqual(["business", "analyst"]);
  });
});

describe("candidateSeniority", () => {
  it("treats someone fresh out of university as entry level", () => {
    expect(candidateSeniority([], 0)).toBe(0);
    expect(candidateSeniority([], null)).toBe(0);
  });

  it("does not let an inflated title outrun the years behind it", () => {
    // Six months as a "Consultant" is not four levels of seniority.
    expect(candidateSeniority(["Consultant"], 0.5)).toBe(1);
  });

  it("lets the title lead once there is history to support it", () => {
    expect(candidateSeniority(["Senior Business Analyst"], 9)).toBe(3);
  });
});

describe("scoreTitleFit", () => {
  it("scores an exact subject match highly", () => {
    const fit = scoreTitleFit("Business Analyst", ["Business Analyst"], []);
    expect(fit.score).toBe(100);
    expect(fit.closest).toBe("Business Analyst");
    expect(fit.seniorityGap).toBe(0);
  });

  it("tempers a role well above what they have held", () => {
    const fit = scoreTitleFit("Head of Business Analysis", ["Business Analyst"], []);
    expect(fit.seniorityGap).toBeGreaterThanOrEqual(2);
    expect(fit.score).toBeLessThan(100);
  });

  it("returns nothing for an unrelated title", () => {
    expect(scoreTitleFit("Pastry Chef", ["Business Analyst"], []).score).toBe(0);
  });

  it("counts a targeted role, slightly below one actually held", () => {
    const held = scoreTitleFit("Data Analyst", ["Data Analyst"], []);
    const targeted = scoreTitleFit("Data Analyst", [], ["Data Analyst"]);
    expect(targeted.score).toBeGreaterThan(0);
    expect(targeted.score).toBeLessThan(held.score);
  });
});
