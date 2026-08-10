import { describe, expect, it } from "vitest";
import {
  directionSuggestionsOutputSchema,
  groundDirectionSuggestions,
} from "./direction-suggestions";

describe("career direction suggestions", () => {
  it("accepts a bounded structured response", () => {
    const parsed = directionSuggestionsOutputSchema.safeParse({
      suggestions: [
        { name: "Service Delivery Director", path: "direct", rationale: "Directly supported by delivery leadership.", evidenceIds: ["e1"] },
        { name: "Transformation Director", path: "adjacent", rationale: "Transfers programme leadership into change.", evidenceIds: ["e2"] },
        { name: "Customer Success Director", path: "stretch", rationale: "Builds on stakeholder and outcome ownership.", evidenceIds: ["e3"] },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("removes invented citations, duplicates and existing priorities", () => {
    const suggestions = groundDirectionSuggestions({ suggestions: [
      { name: "Transformation Director", path: "direct", rationale: "Supported by evidence in the profile.", evidenceIds: ["e1", "invented"] },
      { name: "transformation director", path: "adjacent", rationale: "A duplicate with different casing.", evidenceIds: ["e2"] },
      { name: "Service Delivery Director", path: "direct", rationale: "Already in the selected list.", evidenceIds: ["e2"] },
      { name: "Unsupported Role", path: "stretch", rationale: "No supplied evidence actually supports this.", evidenceIds: ["invented"] },
    ] }, [
      { id: "e1", claim: "Led a regional transformation programme." },
      { id: "e2", claim: "Owned service delivery outcomes." },
    ], ["Service Delivery Director"]);

    expect(suggestions).toEqual([{
      name: "Transformation Director",
      path: "direct",
      rationale: "Supported by evidence in the profile.",
      evidenceIds: ["e1"],
      supportingSignals: ["Led a regional transformation programme."],
    }]);
  });
});
