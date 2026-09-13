import { capabilitiesIn, capabilityForLabel } from "@/lib/matching/skill-vocabulary";

/*
 * The skills section, read off the evidence rather than asked for.
 *
 * Every résumé has one and Sartho's had none: the master route wrote
 * `skills: []` and the tailored one did the same, so the single most scanned
 * block on a résumé was empty on every document the product produced.
 *
 * The obvious fix is a skills taxonomy — Lightcast, ESCO, O*NET — and it is the
 * wrong one here. A taxonomy tells you what a role usually needs, which is a
 * fine way to suggest skills somebody might claim. This product exists because
 * that is exactly what it must not do. A skill on a Sartho résumé has to be one
 * the person can evidence, and the only place that lives is their own approved
 * evidence.
 *
 * So the vocabulary is the one the matcher already uses, and the source is the
 * evidence they approved. A skill appears because they demonstrated it, and the
 * count of how often is what orders the list — not an opinion about what the
 * market wants.
 */

export type EvidenceForSkills = {
  claim?: string | null;
  context?: string | null;
  metrics?: string | null;
  domains?: string[] | null;
};

/*
 * A résumé's skills line is scanned, not read. Past about a dozen it stops
 * being a summary of somebody and becomes a wall that hides the three things
 * that mattered.
 */
export const MAX_RESUME_SKILLS = 12;

/** Every capability this evidence demonstrates, and how many items back each. */
export function skillEvidenceCounts(evidence: EvidenceForSkills[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of evidence) {
    const text = [item.claim, item.context, item.metrics].filter(Boolean).join(". ");
    const found = new Set(capabilitiesIn(text));

    /*
     * The person's own domain tags come through the same vocabulary, so
     * "Consulting" typed on an evidence item and "engagement management" found
     * in its wording land on one capability instead of two near-duplicates.
     */
    for (const domain of item.domains ?? []) {
      const label = capabilityForLabel(domain);
      if (label) found.add(label);
    }

    for (const capability of found) counts.set(capability, (counts.get(capability) ?? 0) + 1);
  }

  return counts;
}

/**
 * The skills for a résumé aimed at nothing in particular.
 *
 * Ordered by how much evidence backs each, so the strongest thing a person can
 * demonstrate leads. Ties break alphabetically rather than by insertion, so the
 * same evidence always produces the same résumé — a document that reshuffles
 * itself between builds is one nobody can trust.
 */
export function skillsFromEvidence(evidence: EvidenceForSkills[], limit = MAX_RESUME_SKILLS): string[] {
  return [...skillEvidenceCounts(evidence)]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([capability]) => capability);
}

/**
 * The same skills, ordered for one advert.
 *
 * What the role asks for comes first, and only where the person can already
 * evidence it — a requirement they cannot back is not promoted into their
 * skills line, it stays out of the résumé entirely. That is the whole
 * difference between tailoring and keyword stuffing, and it is why this takes
 * the matched signals rather than the advert's raw text.
 */
export function skillsForRole(
  evidence: EvidenceForSkills[],
  matchedSignals: string[],
  limit = MAX_RESUME_SKILLS,
): string[] {
  const counts = skillEvidenceCounts(evidence);
  const wanted = new Set(
    matchedSignals
      .map((signal) => capabilityForLabel(signal))
      .filter((capability) => counts.has(capability)),
  );

  return [...counts]
    .sort((a, b) => {
      const aWanted = wanted.has(a[0]) ? 1 : 0;
      const bWanted = wanted.has(b[0]) ? 1 : 0;
      if (aWanted !== bWanted) return bWanted - aWanted;
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    })
    .slice(0, limit)
    .map(([capability]) => capability);
}
