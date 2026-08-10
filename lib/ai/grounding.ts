/*
 * The grounding guardrail.
 *
 * The product's one invariant is that every AI-produced claim traces back to
 * an evidence record the user approved. A model is asked to cite evidence IDs
 * and usually does, but "usually" is not an invariant — it will occasionally
 * cite an ID that belongs to nobody, or to someone else, or that it invented
 * outright to satisfy a schema that demanded at least one.
 *
 * So the citation is never trusted. Every ID a model returns is re-checked
 * here against the exact set of approved records that were sent to it, and
 * anything that does not survive is dropped. This is deliberately a pure
 * function over a set of IDs: no network, no database, no model. It cannot
 * fail open, and it can be tested without any of the three.
 *
 * This logic previously existed as two independent copies, one in the deep
 * analysis route and one in the résumé drafting route. They agreed, which is
 * the problem — the invariant that matters most in the system had no single
 * definition and no test of its own, and the third surface to need it would
 * have hand-rolled a third copy.
 */

/**
 * The IDs a model was actually given, as an O(1) membership test.
 *
 * Built from the rows that were sent in the prompt rather than from a fresh
 * read, so a record approved *during* the model call cannot be cited by a
 * model that was never shown it.
 */
export function approvedEvidenceIds(evidence: Array<{ id: string }>): ReadonlySet<string> {
  return new Set(evidence.map((item) => item.id));
}

/**
 * Keeps only citations that name evidence in `approved`, and de-duplicates.
 *
 * Order is preserved: the model's own ranking is the only signal available for
 * which citation matters most, and re-sorting would discard it.
 */
export function keepGroundedIds(
  cited: readonly string[],
  approved: ReadonlySet<string>,
): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const id of cited) {
    if (!approved.has(id) || seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }

  return kept;
}

export type GroundedAssessment = "met" | "partially_met" | "not_met" | "unknown";
export type GroundedConfidence = "low" | "medium" | "high";

/*
 * An assertion of fact needs a receipt.
 *
 * "met" and "partially_met" are the two answers that claim the person can
 * demonstrate something. If every ID behind such a claim was discarded, the
 * claim is unsupported — and the honest word for unsupported is not "met", it
 * is "unknown". Downgrading rather than deleting keeps the requirement visible
 * so the gap can be seen and closed, which is the whole point of showing it.
 */
export function groundAssessment(
  assessment: GroundedAssessment,
  groundedIds: readonly string[],
): GroundedAssessment {
  if (groundedIds.length) return assessment;
  return assessment === "met" || assessment === "partially_met" ? "unknown" : assessment;
}

/*
 * Confidence is a claim about the evidence, so it cannot outlive it. A model
 * that said "high" while citing nothing that survived was confident about
 * something it did not have.
 */
export function groundConfidence(
  confidence: GroundedConfidence,
  groundedIds: readonly string[],
): GroundedConfidence {
  return groundedIds.length ? confidence : "low";
}
