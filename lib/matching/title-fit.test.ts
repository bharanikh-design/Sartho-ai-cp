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

/*
 * "Managing Consultant — ESG Due Diligence" was recommended at 96% to somebody
 * six months into their career. `includes(" manager ")` never matches
 * " managing ", so the title fell through to the unqualified default of 2.
 */
describe("senior titles that were being read as mid-level", () => {
  it("reads a managing grade as senior", () => {
    expect(seniorityOf("Managing Consultant - ESG Due Diligence")).toBe(4);
    expect(seniorityOf("Managing Director")).toBe(5);
    expect(seniorityOf("Associate Director, Risk")).toBe(5);
    expect(seniorityOf("Executive Consultant")).toBe(4);
  });

  it("keeps that role out of reach of an entry-level candidate", () => {
    const level = candidateSeniority(["Business Analyst"], 0.5);
    expect(level).toBe(1);
    expect(seniorityOf("Managing Consultant") - level).toBeGreaterThan(1);
  });

  it("says whether the closest title was held or only targeted", () => {
    const targeted = scoreTitleFit("Managing Consultant", [], ["Management Consultant"]);
    expect(targeted.closest).toBe("Management Consultant");
    expect(targeted.closestIsHeld).toBe(false);

    const held = scoreTitleFit("Business Analyst", ["Business Analyst"], []);
    expect(held.closestIsHeld).toBe(true);
  });
});
