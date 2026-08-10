import { z } from "zod";

/*
 * Ranking the priorities a person already chose against their own evidence.
 *
 * Distinct from direction-suggestions, which proposes new roles. This reads the
 * roles already on the board and says, for each, how strongly the approved
 * career facts back it — so "which of these eleven is my strongest match" has an
 * answer grounded in evidence rather than a hunch. It asserts no new fact: every
 * verdict cites the approved evidence it rests on, and a role it cannot ground
 * is returned as an honest "unclear" rather than an invented score.
 */

export type MatchLevel = "strong" | "moderate" | "stretch" | "unclear";

export const roleRankingSchema = z.object({
  name: z.string().trim().min(1).max(180),
  match: z.enum(["strong", "moderate", "stretch", "unclear"]),
  reason: z.string().trim().min(8).max(320),
  evidenceIds: z.array(z.string()).max(8),
});

export const roleRankingsOutputSchema = z.object({
  rankings: z.array(roleRankingSchema).min(1).max(20),
});

export const roleRankingsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rankings"],
  properties: {
    rankings: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "match", "reason", "evidenceIds"],
        properties: {
          name: { type: "string" },
          match: { type: "string", enum: ["strong", "moderate", "stretch", "unclear"] },
          reason: { type: "string" },
          evidenceIds: { type: "array", maxItems: 8, items: { type: "string" } },
        },
      },
    },
  },
};

type EvidenceSignal = { id: string; claim: string };

export type GroundedRoleRanking = {
  name: string;
  match: MatchLevel;
  reason: string;
  evidenceIds: string[];
  supportingSignals: string[];
};

const MATCH_ORDER: Record<MatchLevel, number> = { strong: 0, moderate: 1, stretch: 2, unclear: 3 };

/*
 * A verdict is kept only for a role actually on the person's board, matched by
 * name. A "strong" or "moderate" claim with no surviving cited evidence is
 * demoted to "stretch": the model may still see a plausible path, but it cannot
 * call something a proven match with nothing behind it. Roles the model omitted
 * are returned as "unclear" so every priority gets an answer.
 */
export function groundRoleRankings(
  value: z.infer<typeof roleRankingsOutputSchema>,
  evidence: EvidenceSignal[],
  laneNames: string[],
): GroundedRoleRanking[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item.claim]));
  const laneByKey = new Map(laneNames.map((name) => [name.trim().toLocaleLowerCase(), name.trim()]));
  const ranked = new Map<string, GroundedRoleRanking>();

  for (const entry of value.rankings) {
    const key = entry.name.trim().toLocaleLowerCase();
    const laneName = laneByKey.get(key);
    if (!laneName || ranked.has(key)) continue;

    const evidenceIds = [...new Set(entry.evidenceIds)].filter((id) => evidenceById.has(id));
    let match: MatchLevel = entry.match;
    if ((match === "strong" || match === "moderate") && !evidenceIds.length) match = "stretch";

    ranked.set(key, {
      name: laneName,
      match,
      reason: entry.reason.trim(),
      evidenceIds,
      supportingSignals: evidenceIds
        .slice(0, 2)
        .map((id) => evidenceById.get(id))
        .filter((claim): claim is string => Boolean(claim)),
    });
  }

  // Every lane gets a verdict; ones the model skipped are honestly "unclear".
  for (const [key, laneName] of laneByKey) {
    if (!ranked.has(key)) {
      ranked.set(key, {
        name: laneName,
        match: "unclear",
        reason: "Sartho could not tie this role to your approved evidence yet.",
        evidenceIds: [],
        supportingSignals: [],
      });
    }
  }

  return [...ranked.values()].sort((a, b) => MATCH_ORDER[a.match] - MATCH_ORDER[b.match]);
}
