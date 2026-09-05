import type { CareerRoleRecord, EvidenceRecord, TargetLaneRecord } from "@/lib/types";
import { analyseJobDescription, type JobAnalysis } from "@/lib/matching/analyse-job";
import { buildSkillProfile } from "@/lib/matching/skill-profile";
import { scoreTitleFit } from "@/lib/matching/title-fit";

/*
 * Turning a match into a ranked opportunity.
 *
 * analyseJobDescription judges a role against approved evidence and nothing
 * else — deliberately, because a career it cannot evidence is a career it
 * cannot claim. But the person also told Sartho where they want to go, in the
 * priorities they set on Career Direction. That intent used to reach nothing.
 * This is where it re-enters: a role that lands in a stated priority is lifted
 * in proportion to how much weight the person put on that priority, so the
 * direction they chose actually orders what surfaces.
 */

export type LaneAlignment = { lane: TargetLaneRecord; overlap: number };

function normalise(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * The active target lane a role aligns to, or null when it sits outside every
 * stated priority. A lane matches when at least half of the meaningful words in
 * its name appear in the role's title or description; ties break toward the
 * higher-priority lane, then the stronger overlap.
 */
export function alignToLanes(
  title: string,
  rawText: string,
  lanes: TargetLaneRecord[],
): LaneAlignment | null {
  const haystack = normalise(`${title} ${rawText}`);
  let best: LaneAlignment | null = null;

  for (const lane of lanes) {
    if (!lane.active) continue;
    const words = normalise(lane.name).trim().split(" ").filter((word) => word.length > 2);
    if (!words.length) continue;

    const hits = words.filter((word) => haystack.includes(` ${word} `)).length;
    const overlap = hits / words.length;
    if (overlap < 0.5) continue;

    if (
      !best
      || lane.priority < best.lane.priority
      || (lane.priority === best.lane.priority && overlap > best.overlap)
    ) {
      best = { lane, overlap };
    }
  }

  return best;
}

/** The parts of a score, kept separate so a number can always explain itself. */
export type ScoreBreakdown = {
  /** Having done this job before. */
  titleFit: number;
  /** Being able to evidence what this job asks for. */
  requirementCoverage: number;
  /** How well corroborated those matched capabilities are. */
  evidenceDepth: number;
  /** Lift from a stated priority, 0–10. */
  priorityLift: number;
};

/*
 * The blend. Three independent legs, because any one of them alone misleads:
 *
 *   Title alone   — a Business Analyst who has never touched what this
 *                   particular advert asks for.
 *   Coverage alone — a broad skill overlap with a job at a level or in a
 *                   function the person has never worked in.
 *   Depth alone    — one strong skill mentioned once.
 *
 * Requirement coverage carries the most weight: it is the question a person is
 * actually asking. The priority lift is small and last, because wanting a role
 * is not evidence of being able to do it.
 */
export function overallMatchScore(analysis: JobAnalysis, alignment: LaneAlignment | null): number {
  const breakdown = scoreBreakdown(analysis, alignment);
  const total =
    breakdown.titleFit * 0.35
    + breakdown.requirementCoverage * 0.4
    + breakdown.evidenceDepth * 0.25
    + breakdown.priorityLift;
  return Math.max(0, Math.min(100, Math.round(total)));
}

export function scoreBreakdown(analysis: JobAnalysis, alignment: LaneAlignment | null): ScoreBreakdown {
  return {
    titleFit: analysis.titleFit,
    requirementCoverage: analysis.requirementCoverage,
    evidenceDepth: analysis.evidenceBacking,
    priorityLift: alignment ? Math.round(alignment.lane.weight * 0.1 * alignment.overlap) : 0,
  };
}

/**
 * The stored analysis, with the matched priority named on it so the UI can say
 * "this matches a direction you set" rather than the score arriving unexplained.
 */
export function withLane(analysis: JobAnalysis, alignment: LaneAlignment | null): JobAnalysis & { primaryLane?: string } {
  return alignment ? { ...analysis, primaryLane: alignment.lane.name } : analysis;
}

/**
 * The one place a role is scored. Both the analyse-preview and the save go
 * through this, so what you see before saving is exactly what gets stored —
 * no second, divergent matcher. Deterministic and evidence-only: no embeddings,
 * so it never silently returns "skip" because a sync did not run.
 */
export function scoreOpportunity(
  title: string,
  description: string,
  evidence: EvidenceRecord[],
  roles: CareerRoleRecord[],
  lanes: TargetLaneRecord[],
) {
  // Titles the person has actually held, and the ones they are aiming at.
  const heldTitles = roles.map((role) => role.title).filter(Boolean);
  const targetTitles = lanes.filter((lane) => lane.active).map((lane) => lane.name);
  const titleFit = scoreTitleFit(title, heldTitles, targetTitles);

  const analysis = analyseJobDescription(description, buildSkillProfile(evidence, roles), { titleFit });
  const alignment = alignToLanes(title, description, lanes);

  return {
    analysis: withLane(analysis, alignment),
    overallMatch: overallMatchScore(analysis, alignment),
    breakdown: scoreBreakdown(analysis, alignment),
    evidenceBacking: analysis.evidenceBacking,
    recommendation: analysis.recommendation,
  };
}
