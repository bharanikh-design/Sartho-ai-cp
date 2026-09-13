import { describe, expect, it } from "vitest";
import { analysisSetback, shouldAutoAnalyse, summariseAnalysis } from "@/lib/jobs/auto-analysis";
import type { DeepAnalysisSummary } from "@/lib/types";

const summary = (over: Partial<DeepAnalysisSummary> = {}): DeepAnalysisSummary => ({
  mandatoryMet: 0,
  mandatoryTotal: 0,
  preferredMet: 0,
  preferredTotal: 0,
  strongestMatches: [],
  honestGaps: [],
  recruiterSignals: [],
  ...over,
});

describe("shouldAutoAnalyse", () => {
  it("analyses a role that has never been read", () => {
    expect(shouldAutoAnalyse({ deep_analysis_status: "not_started" })).toBe(true);
  });

  it("retries a role whose last analysis failed", () => {
    expect(shouldAutoAnalyse({ deep_analysis_status: "failed" })).toBe(true);
  });

  it("retries a role left mid-analysis by a closed tab", () => {
    expect(shouldAutoAnalyse({ deep_analysis_status: "processing" })).toBe(true);
  });

  it("does not spend a second analysis on an advert it has already read", () => {
    expect(shouldAutoAnalyse({ deep_analysis_status: "complete" })).toBe(false);
  });
});

describe("analysisSetback", () => {
  it("passes on the route's own words about unapproved evidence", () => {
    expect(analysisSetback(400, "Approve Career Profile evidence before running deep analysis."))
      .toBe("Approve Career Profile evidence before running deep analysis.");
  });

  it("explains an unusable evidence state even when the route says nothing", () => {
    expect(analysisSetback(400)).toContain("Career Profile");
  });

  it("names the allowance when the quota is spent", () => {
    expect(analysisSetback(429, "This account has reached its monthly AI allowance."))
      .toBe("This account has reached its monthly AI allowance.");
  });

  it("asks for a fresh sign-in rather than repeating a bare 401", () => {
    expect(analysisSetback(401, "Unauthorized")).toBe("Sign in again to analyse this role.");
  });

  it("says the role is still saved when the analysis breaks", () => {
    expect(analysisSetback(500)).toContain("saved the role");
  });

  it("ignores whitespace-only errors from the server", () => {
    expect(analysisSetback(500, "   ")).toContain("saved the role");
  });
});

describe("summariseAnalysis", () => {
  it("leads with mandatory coverage", () => {
    expect(summariseAnalysis(summary({ mandatoryMet: 6, mandatoryTotal: 8 })))
      .toBe("6 of 8 must-haves evidenced");
  });

  it("adds preferred coverage and gaps", () => {
    expect(summariseAnalysis(summary({
      mandatoryMet: 6,
      mandatoryTotal: 8,
      preferredMet: 3,
      preferredTotal: 5,
      honestGaps: ["CISSP", "Kubernetes"],
    }))).toBe("6 of 8 must-haves evidenced · 3 of 5 nice-to-haves · 2 gaps to close");
  });

  it("counts a single gap in the singular", () => {
    expect(summariseAnalysis(summary({ mandatoryMet: 7, mandatoryTotal: 8, honestGaps: ["CISSP"] })))
      .toBe("7 of 8 must-haves evidenced · 1 gap to close");
  });

  it("omits a section the advert had nothing for", () => {
    expect(summariseAnalysis(summary({ preferredMet: 2, preferredTotal: 4 })))
      .toBe("2 of 4 nice-to-haves");
  });

  it("says an advert stated nothing checkable rather than printing a zero score", () => {
    expect(summariseAnalysis(summary())).toBe("No checkable requirements found in this advert");
  });
});
