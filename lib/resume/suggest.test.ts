import { describe, expect, it } from "vitest";
import { MIN_SUGGESTION_SCORE, roleSimilarity, suggestResumeFor, type PastResume } from "./suggest";

const resume = (jobTitle: string, overrides: Partial<PastResume> = {}): PastResume => ({
  applicationId: `app-${jobTitle.toLowerCase().replace(/\W+/g, "-")}`,
  jobTitle,
  employer: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("how alike two roles are", () => {
  it("calls the same title the same role", () => {
    expect(roleSimilarity("ServiceNow Delivery Manager", "ServiceNow Delivery Manager")).toBe(100);
  });

  /*
   * Seniority words are stripped before comparing, which is what makes one
   * job at two levels read as one job rather than two.
   */
  it("sees through a seniority word", () => {
    expect(roleSimilarity("Senior ServiceNow Delivery Manager", "ServiceNow Delivery Manager"))
      .toBeGreaterThanOrEqual(MIN_SUGGESTION_SCORE);
  });

  it("does not punish a short title for being short", () => {
    expect(roleSimilarity("Engagement Manager", "Senior Client Engagement Manager"))
      .toBeGreaterThanOrEqual(MIN_SUGGESTION_SCORE);
  });

  /*
   * The case the floor exists for: one distinctive word in common and nothing
   * else. A delivery manager's résumé is no use to a delivery driver.
   */
  it("is not fooled by a single shared word", () => {
    expect(roleSimilarity("Delivery Manager", "Delivery Driver")).toBeLessThan(MIN_SUGGESTION_SCORE);
  });

  it("scores unrelated work near nothing", () => {
    expect(roleSimilarity("ITSM Transformation Manager", "Retail Sales Assistant")).toBeLessThan(MIN_SUGGESTION_SCORE);
  });

  it("says nothing about an empty title", () => {
    expect(roleSimilarity("", "Engagement Manager")).toBe(0);
    expect(roleSimilarity("Engagement Manager", "")).toBe(0);
  });

  /* Family agreement is a nudge, never enough on its own. */
  it("does not suggest a role on family alone", () => {
    /* Both Consulting, no words in common. */
    expect(roleSimilarity("Management Consultant", "Practice Lead")).toBeLessThan(MIN_SUGGESTION_SCORE);
  });
});

describe("which résumé to start from", () => {
  it("picks the closest role", () => {
    const suggestion = suggestResumeFor("ServiceNow Delivery Director", [
      resume("Retail Sales Assistant"),
      resume("ServiceNow Delivery Manager"),
      resume("Financial Analyst"),
    ]);
    expect(suggestion?.resume.jobTitle).toBe("ServiceNow Delivery Manager");
  });

  it("offers nothing when nothing is close", () => {
    expect(suggestResumeFor("ServiceNow Delivery Director", [resume("Retail Sales Assistant")])).toBeNull();
  });

  it("offers nothing when there are no résumés yet", () => {
    expect(suggestResumeFor("ServiceNow Delivery Director", [])).toBeNull();
  });

  /*
   * The newer of two equally close roles carries the person's latest edits,
   * and is the one they would have reached for themselves.
   */
  it("breaks a tie on recency", () => {
    const suggestion = suggestResumeFor("ITSM Transformation Manager", [
      resume("ITSM Transformation Manager", { applicationId: "old", updatedAt: "2025-01-01T00:00:00.000Z" }),
      resume("ITSM Transformation Manager", { applicationId: "new", updatedAt: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(suggestion?.resume.applicationId).toBe("new");
  });

  it("survives a résumé with no timestamp", () => {
    const suggestion = suggestResumeFor("ITSM Transformation Manager", [
      resume("ITSM Transformation Manager", { updatedAt: "" }),
    ]);
    expect(suggestion).not.toBeNull();
  });

  it("names the employer when it has one", () => {
    const suggestion = suggestResumeFor("ServiceNow Delivery Director", [
      resume("ServiceNow Delivery Manager", { employer: "Accenture" }),
    ]);
    expect(suggestion?.reason).toContain("Accenture");
  });

  /* The reason says what actually matched, not that something did. */
  it("names the words the two roles share", () => {
    const suggestion = suggestResumeFor("ServiceNow Delivery Director", [resume("ServiceNow Delivery Manager")]);
    expect(suggestion?.reason).toContain("servicenow");
  });

  it("ignores a blank target title", () => {
    expect(suggestResumeFor("   ", [resume("ServiceNow Delivery Manager")])).toBeNull();
  });

  it("carries the application id the caller needs to open it", () => {
    const suggestion = suggestResumeFor("ServiceNow Delivery Director", [
      resume("ServiceNow Delivery Manager", { applicationId: "app-42" }),
    ]);
    expect(suggestion?.resume.applicationId).toBe("app-42");
  });
});
