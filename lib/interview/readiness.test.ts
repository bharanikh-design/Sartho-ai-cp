import { describe, expect, it } from "vitest";
import { interviewCoachBlockedReason } from "@/lib/interview/readiness";

/*
 * These mirror the two guards in app/api/jobs/[id]/interview-prep/route.ts.
 * The point of having them on the client at all is that the route's refusal
 * arrives after the click, and a button whose only possible outcome is a 400
 * is worse than a sentence saying what to do first.
 */

const ready = { analysisComplete: true, requirementCount: 7, approvedEvidenceCount: 12 };

describe("interviewCoachBlockedReason", () => {
  it("lets a fully prepared role through", () => {
    expect(interviewCoachBlockedReason(ready)).toBeNull();
  });

  it("sends you to the Career Profile match when the analysis has not run", () => {
    expect(interviewCoachBlockedReason({ ...ready, analysisComplete: false })).toMatch(/Career Profile match/);
  });

  it("sends you there too when the analysis says complete but found nothing", () => {
    /*
     * The route requires both — `deep_analysis_status === "complete"` AND a
     * non-empty requirement list — because a match that completed and
     * extracted no requirements gives the coach nothing to build from. Reading
     * only the status would offer the button and take the 400.
     */
    expect(interviewCoachBlockedReason({ ...ready, requirementCount: 0 })).toMatch(/Career Profile match/);
  });

  it("asks for approved evidence when there is none", () => {
    expect(interviewCoachBlockedReason({ ...ready, approvedEvidenceCount: 0 })).toMatch(/approved|Approve/);
  });

  it("names the analysis first when both are missing", () => {
    /* Approving evidence would not unblock anything while the match is unrun. */
    expect(interviewCoachBlockedReason({ analysisComplete: false, requirementCount: 0, approvedEvidenceCount: 0 }))
      .toMatch(/Career Profile match/);
  });

  it("does not trust a negative count", () => {
    expect(interviewCoachBlockedReason({ ...ready, requirementCount: -1 })).not.toBeNull();
    expect(interviewCoachBlockedReason({ ...ready, approvedEvidenceCount: -1 })).not.toBeNull();
  });
});
