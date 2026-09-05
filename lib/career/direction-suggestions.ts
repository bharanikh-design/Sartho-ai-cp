import { z } from "zod";
import { familyFit } from "@/lib/matching/job-family";
import { candidateSeniority, seniorityOf } from "@/lib/matching/title-fit";

export const directionSuggestionSchema = z.object({
  name: z.string().trim().min(2).max(180),
  path: z.enum(["direct", "adjacent", "stretch"]),
  rationale: z.string().trim().min(10).max(700),
  evidenceIds: z.array(z.string()).min(1).max(8),
});

export const directionSuggestionsOutputSchema = z.object({
  suggestions: z.array(directionSuggestionSchema).min(3).max(6),
});

export const directionSuggestionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "path", "rationale", "evidenceIds"],
        properties: {
          name: { type: "string" },
          path: { type: "string", enum: ["direct", "adjacent", "stretch"] },
          rationale: { type: "string" },
          evidenceIds: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
        },
      },
    },
  },
};

type EvidenceSignal = { id: string; claim: string };

/*
 * How far above a person a suggested direction may sit.
 *
 * One grade, the same reach the job search allows, because a target role is
 * what the search then goes and looks for — letting a level-4 direction be
 * saved here quietly reintroduces every listing the search filter exists to
 * remove.
 */
export const MAX_SUGGESTION_STRETCH = 1;

export type DirectionGuard = {
  /** Titles this person has actually held. */
  heldTitles: string[];
  /** Years worked, which tempers an inflated title. */
  totalExperienceYears: number | null;
  /** True when the person's own steering asked to change function. */
  allowFunctionChange: boolean;
};

export type GroundedDirectionSuggestion = {
  name: string;
  path: "direct" | "adjacent" | "stretch";
  rationale: string;
  evidenceIds: string[];
  supportingSignals: string[];
};

/**
 * Keep only the suggestions that survive contact with the facts.
 *
 * The prompt is told to respect seniority and stay in the same line of work.
 * That is worth saying, and it is not worth trusting: a model asked for "at
 * most two stretch moves" with no anchor proposed "Sales Manager / Solutions
 * Consultant" to a business analyst six months into their career, and once
 * saved as a target role that is what the job search goes looking for. So the
 * same two rules the search enforces are enforced again here, deterministically,
 * on the way back.
 */
export function groundDirectionSuggestions(
  value: z.infer<typeof directionSuggestionsOutputSchema>,
  evidence: EvidenceSignal[],
  existingNames: string[],
  guard?: DirectionGuard,
): GroundedDirectionSuggestion[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item.claim]));
  const seen = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
  const level = guard ? candidateSeniority(guard.heldTitles, guard.totalExperienceYears) : null;

  return value.suggestions.flatMap((suggestion) => {
    const key = suggestion.name.trim().toLocaleLowerCase();
    if (seen.has(key)) return [];

    const evidenceIds = [...new Set(suggestion.evidenceIds)].filter((id) => evidenceById.has(id));
    if (!evidenceIds.length) return [];

    if (guard && level !== null) {
      if (seniorityOf(suggestion.name) - level > MAX_SUGGESTION_STRETCH) return [];
      /*
       * A change of function is a real thing a person may want, so it is
       * refused only when they have not asked for one.
       */
      if (!guard.allowFunctionChange
        && !familyFit(suggestion.name, guard.heldTitles, existingNames).withinReach) return [];
    }

    seen.add(key);
    return [{
      name: suggestion.name.trim(),
      path: suggestion.path,
      rationale: suggestion.rationale.trim(),
      evidenceIds,
      supportingSignals: evidenceIds
        .slice(0, 2)
        .map((id) => evidenceById.get(id))
        .filter((claim): claim is string => Boolean(claim)),
    }];
  });
}
