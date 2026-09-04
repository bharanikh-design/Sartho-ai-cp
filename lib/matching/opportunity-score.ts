import type { TargetLaneRecord } from "@/lib/types";
import type { JobAnalysis } from "@/lib/matching/analyse-job";

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

/**
 * One 0–100 score for ordering opportunities. Evidence backing and skill
 * coverage set the base; a role in a stated priority lane is lifted by up to
 * ~20 points, scaled by that lane's weight and how squarely the role matches.
 */
export function overallMatchScore(analysis: JobAnalysis, alignment: LaneAlignment | null): number {
  const base = analysis.evidenceBacking * 0.6 + analysis.coverage * 0.4;
  const laneBoost = alignment ? alignment.lane.weight * 0.2 * alignment.overlap : 0;
  return Math.max(0, Math.min(100, Math.round(base + laneBoost)));
}

/**
 * The stored analysis, with the matched priority named on it so the UI can say
 * "this matches a direction you set" rather than the score arriving unexplained.
 */
export function withLane(analysis: JobAnalysis, alignment: LaneAlignment | null): JobAnalysis & { primaryLane?: string } {
  return alignment ? { ...analysis, primaryLane: alignment.lane.name } : analysis;
}
