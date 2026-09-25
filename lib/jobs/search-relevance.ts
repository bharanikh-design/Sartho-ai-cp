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

  // No/unclear semantic answer: preserve the old conservative safety boundary.
  // A role with weak title/family vocabulary needs semantic confirmation before
  // it may be rescued into the visible feed.
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

export function sortByRelevance<T extends { relevanceTier?: SearchRelevanceTier; overallMatch: number }>(
  candidates: T[],
): T[] {
  const rank: Record<SearchRelevanceTier, number> = { strong: 0, possible: 1, outside: 2 };
  return [...candidates].sort((a, b) => {
    const tierA = rank[a.relevanceTier ?? "possible"];
    const tierB = rank[b.relevanceTier ?? "possible"];
    return tierA - tierB || b.overallMatch - a.overallMatch;
  });
}
