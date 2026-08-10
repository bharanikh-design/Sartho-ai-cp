import { z } from "zod";

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

export type GroundedDirectionSuggestion = {
  name: string;
  path: "direct" | "adjacent" | "stretch";
  rationale: string;
  evidenceIds: string[];
  supportingSignals: string[];
};

export function groundDirectionSuggestions(
  value: z.infer<typeof directionSuggestionsOutputSchema>,
  evidence: EvidenceSignal[],
  existingNames: string[],
): GroundedDirectionSuggestion[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item.claim]));
  const seen = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));

  return value.suggestions.flatMap((suggestion) => {
    const key = suggestion.name.trim().toLocaleLowerCase();
    if (seen.has(key)) return [];

    const evidenceIds = [...new Set(suggestion.evidenceIds)].filter((id) => evidenceById.has(id));
    if (!evidenceIds.length) return [];

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
