import type { JobStatus } from "@/lib/types";

/*
 * Why an application ended, in a form that can be mined.
 *
 * The product architecture asks for the record to learn from outcomes:
 * "twelve applications that died at screening is a signal about how you are
 * positioned, not twelve separate misfortunes." A status field cannot carry
 * that signal — "rejected" is the same word whether the résumé never got read
 * or the final panel went to someone else. So an ending is recorded as two
 * bounded facts that later analysis can group on: the stage it ended at, and
 * the reason it ended. An optional free-text note holds the specifics that no
 * fixed vocabulary should try to.
 *
 * This is deliberately the single definition of that vocabulary. The Zod
 * validator on the write path and the labels in the UI both read from here;
 * the SQL check constraint in the migration mirrors these exact string values
 * and must be changed with them.
 */

/** The two endings that warrant a recorded reason. Every other status is a stage still in motion. */
export const TERMINAL_OUTCOME_STATUSES = ["rejected", "withdrawn"] as const;
export type TerminalOutcomeStatus = (typeof TERMINAL_OUTCOME_STATUSES)[number];

export function isTerminalOutcome(status: JobStatus): status is TerminalOutcomeStatus {
  return (TERMINAL_OUTCOME_STATUSES as readonly string[]).includes(status);
}

/*
 * The stage an application had reached when it ended. Kept coarse on purpose:
 * these are the points a candidate can actually be turned away at, and a
 * grouping is only useful if many applications land in the same bucket.
 */
export const OUTCOME_STAGES = [
  "pre_submission",
  "screening",
  "assessment",
  "interview",
  "offer",
] as const;
export type OutcomeStage = (typeof OUTCOME_STAGES)[number];

export const OUTCOME_STAGE_LABELS: Record<OutcomeStage, string> = {
  pre_submission: "Before applying",
  screening: "Application screening",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer stage",
};

/*
 * The stage is derived from the position the application already held rather
 * than asked for. The person moving a role to "rejected" knows why, not which
 * pipeline box it was in; the box is something the record already knows, so it
 * fills that in itself. A previous status that is itself terminal carries no
 * stage information, so the derivation declines to invent one.
 */
export function deriveOutcomeStage(previousStatus: JobStatus): OutcomeStage | null {
  switch (previousStatus) {
    case "saved":
    case "analysed":
    case "approved":
      return "pre_submission";
    case "applied":
    case "acknowledged":
      return "screening";
    case "assessment":
      return "assessment";
    case "interview":
      return "interview";
    case "offer":
      return "offer";
    case "rejected":
    case "withdrawn":
      return null;
  }
}

/*
 * One shared reason set covers both endings. A rejection and a withdrawal can
 * turn on the same fact — compensation, location, a mutual lack of fit — and a
 * split vocabulary would only make the two harder to compare later.
 */
export const OUTCOME_REASONS = [
  "chose_other_candidate",
  "skills_gap",
  "seniority_mismatch",
  "compensation",
  "location_or_authorisation",
  "role_frozen",
  "no_response",
  "not_a_fit",
  "other",
] as const;
export type OutcomeReason = (typeof OUTCOME_REASONS)[number];

export const OUTCOME_REASON_LABELS: Record<OutcomeReason, string> = {
  chose_other_candidate: "They chose another candidate",
  skills_gap: "Missing a required skill",
  seniority_mismatch: "Seniority mismatch",
  compensation: "Compensation misaligned",
  location_or_authorisation: "Location or work authorisation",
  role_frozen: "Role frozen or withdrawn by employer",
  no_response: "No response",
  not_a_fit: "Not the right fit",
  other: "Other",
};

export function isOutcomeReason(value: unknown): value is OutcomeReason {
  return typeof value === "string" && (OUTCOME_REASONS as readonly string[]).includes(value);
}
