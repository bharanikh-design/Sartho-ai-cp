import { describe, expect, it } from "vitest";
import { seniorityReach } from "./seniority-reach";

/* Six months of experience, with a real but junior job title behind it. */
const fresh = { held: ["Business Analyst"], years: 0.5 };

describe("seniorityReach", () => {
  it("keeps a role at the grade they should be applying for", () => {
    const reach = seniorityReach("Business Analyst", fresh.held, fresh.years);
    expect(reach.withinReach).toBe(true);
    expect(reach.warning).toBeNull();
  });

  it("rules out the exact role that slipped through: a manager posting", () => {
    const reach = seniorityReach(
      "Data & Analytics Management Consultant (Senior Consultants/Engagement Manager)",
      fresh.held,
      fresh.years,
    );
    expect(reach.jobLevel).toBe(4);
    expect(reach.candidateLevel).toBe(1);
    expect(reach.withinReach).toBe(false);
    expect(reach.warning).toContain("3 levels above you");
  });

  it("rules out senior postings for someone six months in", () => {
    expect(seniorityReach("Senior Business Analyst", fresh.held, fresh.years).withinReach).toBe(false);
  });

  it("lets an experienced person reach one level up", () => {
    const senior = seniorityReach("Senior Business Analyst", ["Business Analyst"], 9);
    expect(senior.withinReach).toBe(true);
  });

  it("still rules out a jump of two levels for an experienced person", () => {
    expect(seniorityReach("Head of Analytics", ["Business Analyst"], 9).withinReach).toBe(false);
  });
});
