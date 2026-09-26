/*
 * Whether the interview coach can run, and what to do if it cannot.
 *
 * The route refuses in two places — no completed requirement mapping, or no
 * approved evidence — and each refusal is a different next step for the
 * person. Deciding that here rather than in the button's onClick means the
 * screen can say which one applies *before* the click, instead of offering an
 * action whose only possible outcome is a 400.
 *
 * The strings mirror the route's own guards in
 * app/api/jobs/[id]/interview-prep/route.ts. If a guard moves, this moves.
 */

export type InterviewReadiness = {
  analysisComplete: boolean;
  requirementCount: number;
  approvedEvidenceCount: number;
};

/** The reason the coach cannot run, phrased as the thing to go and do, or null. */
export function interviewCoachBlockedReason(state: InterviewReadiness): string | null {
  if (!state.analysisComplete || state.requirementCount <= 0) {
    return "Run the Career Profile match above first. The coach builds its questions from the requirements that match finds, so it has nothing to work from until it has run.";
  }
  if (state.approvedEvidenceCount <= 0) {
    return "Approve some Career Profile evidence first. Every experience answer is built from records you have confirmed, so the coach has nothing to cite yet.";
  }
  return null;
}
