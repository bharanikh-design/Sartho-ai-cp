import type { SemanticJobFit } from "@/lib/types";

export type SearchRelevanceTier = "strong" | "possible" | "outside";

export type RelevanceCandidate = {
  url: string;
  overallMatch: number;
  recommendation: "apply" | "review" | "skip";
  titleFit: number;
  requirementCoverage: number;
  applyDirect: boolean;
  familyWithinReach: boolean;
  specialistConflict: boolean;
  semanticAttempted: boolean;
};

export type RelevanceDecision = {
  tier: SearchRelevanceTier;
  reason: string;
  semanticUsed: boolean;
  rescued: boolean;
};

/**
 * Semantic relation is a categorical guard/ranking decision, not a second
 * numeric match formula.
 *
 * The deterministic score remains useful for ordering *within* a tier. It may
 * not discard a role merely because the title/family vocabulary is weak.
 */
export function decideSearchRelevance(
  candidate: RelevanceCandidate,
  semanticFit?: SemanticJobFit,
): RelevanceDecision {
  if (semanticFit) {
    if (semanticFit.relation === "aligned") {
      return {
        tier: "strong",
        reason: semanticFit.reason,
        semanticUsed: true,
        rescued: candidate.recommendation === "skip" || candidate.titleFit < 35 || !candidate.familyWithinReach,
      };
    }

    if (semanticFit.relation === "adjacent") {
      return {
        tier: "possible",
        reason: semanticFit.reason,
        semanticUsed: true,
        rescued: candidate.recommendation === "skip" || candidate.titleFit < 35 || !candidate.familyWithinReach,
      };
    }

    if (semanticFit.relation === "conflict") {
      if (semanticFit.confidence === "high") {
        return {
          tier: "outside",
          reason: semanticFit.reason,
          semanticUsed: true,
          rescued: false,
        };
      }
      return {
        tier: "possible",
        reason: semanticFit.reason,
        semanticUsed: true,
        rescued: false,
      };
    }
  }

  /*
   * A deterministic specialist contradiction remains a safety boundary during
   * semantic failure. The outage fallback must never turn "SAP FICO" into a
   * plausible ServiceNow role merely because the model call did not answer.
   */
  if (candidate.specialistConflict) {
    return {
      tier: "outside",
      reason: "The role carries a specialist context that conflicts with the candidate's established direction.",
      semanticUsed: false,
      rescued: false,
    };
  }

  /*
   * Graceful degradation for the bounded semantic shortlist.
   *
   * If Sartho deliberately selected this job for semantic review but that
   * particular chunk failed, retain it as Possible when the deterministic
   * evidence is at least plausible. This is bounded by semanticAttempted, so a
   * provider outage cannot promote the whole raw market into the visible feed.
   */
  if (candidate.semanticAttempted && (!candidate.familyWithinReach || candidate.titleFit < 35)) {
    return {
      tier: "possible",
      reason: "Semantic review was temporarily unavailable; retained as a bounded possible match because it was selected among the strongest candidates for deeper review.",
      semanticUsed: false,
      rescued: true,
    };
  }

  // Jobs outside the bounded semantic shortlist keep the conservative fallback.
  if (!candidate.familyWithinReach || candidate.titleFit < 35) {
    return {
      tier: "outside",
      reason: "Semantic confirmation was unavailable for a weak title/family match.",
      semanticUsed: false,
      rescued: false,
    };
  }

  if (candidate.recommendation === "apply") {
    return {
      tier: "strong",
      reason: "Strong evidence-grounded match from the canonical matcher.",
      semanticUsed: false,
      rescued: false,
    };
  }
  if (candidate.recommendation === "review") {
    return {
      tier: "possible",
      reason: "Worth reviewing, with some gaps or uncertainty.",
      semanticUsed: false,
      rescued: false,
    };
  }

  return {
    tier: "outside",
    reason: "The available evidence does not currently support this opportunity.",
    semanticUsed: false,
    rescued: false,
  };
}

/**
 * Bounded semantic shortlist.
 *
 * Most candidates are selected by the existing deterministic score, but a
 * deliberate rescue lane reserves capacity for jobs the old title/family
 * vocabulary disliked while their requirement/evidence overlap is meaningful.
 * This is how semantic intelligence gets a chance to correct a weak vocabulary
 * without semantically analysing the whole provider result set.
 */
export function selectSemanticCandidates<T extends RelevanceCandidate>(
  candidates: T[],
  limit = 12,
): T[] {
  if (limit <= 0) return [];

  const byCanonical = [...candidates].sort((a, b) =>
    b.overallMatch - a.overallMatch
    || b.requirementCoverage - a.requirementCoverage
    || Number(b.applyDirect) - Number(a.applyDirect),
  );

  const rescue = [...candidates]
    .filter((candidate) =>
      candidate.titleFit < 35
      || !candidate.familyWithinReach
      || candidate.recommendation === "skip",
    )
    .sort((a, b) =>
      b.requirementCoverage - a.requirementCoverage
      || b.overallMatch - a.overallMatch
      || Number(b.applyDirect) - Number(a.applyDirect),
    );

  // Reserve one third for semantic rescue, at least two when possible.
  const rescueSlots = Math.min(rescue.length, Math.max(2, Math.floor(limit / 3)));
  const coreSlots = Math.max(0, limit - rescueSlots);
  const selected = new Map<string, T>();

  for (const item of byCanonical.slice(0, coreSlots)) selected.set(item.url, item);
  for (const item of rescue) {
    if (selected.size >= limit) break;
    selected.set(item.url, item);
  }
  for (const item of byCanonical) {
    if (selected.size >= limit) break;
    selected.set(item.url, item);
  }

  return [...selected.values()];
}

/**
 * The bounded ranking blend, used to order roles *within* a tier.
 *
 * The deterministic `overallMatch` is the floor and the dominant term. Semantic
 * fit and learned affinity apply only *bounded* adjustments on top, so a role
 * the keywords underrate but the evidence-grounded semantic read likes — or one
 * aligned with what this person actually engages with — can rise a few places,
 * and a semantic conflict can sink, without either signal overriding the
 * evidence score, emptying the feed, or flooding it with off-target roles.
 *
 * Crucially: with no AI signals present this returns `overallMatch` unchanged,
 * so a semantic/affinity outage ranks results exactly as the deterministic
 * matcher does today. The blend can only ever reorder; it never gates.
 */
export type RankingSignals = {
  semanticFit?: SemanticJobFit;
  /** Learned-affinity nudge in [-1, 1]: positive concept hits raise, negative lower. */
  affinityDelta?: number;
};

// Bounds are deliberately small relative to the 0–100 score: the AI can move a
// role a few places, not leap it past the evidence.
const SEMANTIC_BONUS = { aligned: 10, adjacent: 4, conflict: -12 } as const;
const CONFIDENCE_WEIGHT = { high: 1, medium: 0.66, low: 0.33 } as const;
const AFFINITY_MAX = 8;

/**
 * A gentle learned-affinity nudge in [-1, 1] from whether the role's text names
 * concepts the person has shown a preference for (raises) or against (lowers).
 * Deliberately conservative: a single positive hit is a small lift, a negative
 * hit a slightly larger caution, and the whole thing is clamped so affinity can
 * only ever nudge ordering, never dominate the evidence score.
 */
export function affinityDelta(
  text: string,
  positive: readonly string[],
  negative: readonly string[],
): number {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const hit = (concept: string) => {
    const c = concept.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    return c.length > 2 && haystack.includes(` ${c} `);
  };
  let delta = 0;
  for (const concept of positive) if (hit(concept)) delta += 0.5;
  for (const concept of negative) if (hit(concept)) delta -= 0.6;
  return Math.max(-1, Math.min(1, delta));
}

export function blendRankingScore(overallMatch: number, signals: RankingSignals = {}): number {
  const base = Math.max(0, Math.min(100, overallMatch));
  let adjustment = 0;

  const fit = signals.semanticFit;
  if (fit && fit.relation !== "unclear") {
    adjustment += SEMANTIC_BONUS[fit.relation] * CONFIDENCE_WEIGHT[fit.confidence];
  }

  if (typeof signals.affinityDelta === "number" && Number.isFinite(signals.affinityDelta)) {
    adjustment += Math.max(-1, Math.min(1, signals.affinityDelta)) * AFFINITY_MAX;
  }

  return Math.max(0, Math.min(100, Math.round(base + adjustment)));
}

export function sortByRelevance<T extends { relevanceTier?: SearchRelevanceTier; overallMatch: number; rankingScore?: number }>(
  candidates: T[],
): T[] {
  const rank: Record<SearchRelevanceTier, number> = { strong: 0, possible: 1, outside: 2 };
  // Within a tier, order by the blended ranking score when present, otherwise by
  // the deterministic score — so nothing changes when no AI signal was attached.
  return [...candidates].sort((a, b) => {
    const tierA = rank[a.relevanceTier ?? "possible"];
    const tierB = rank[b.relevanceTier ?? "possible"];
    return tierA - tierB || (b.rankingScore ?? b.overallMatch) - (a.rankingScore ?? a.overallMatch);
  });
}
