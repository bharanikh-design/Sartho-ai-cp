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

/*
 * The reported failure, reproduced: a business analyst six months into their
 * career was offered "Sales Manager / Solutions Consultant", saved it as a
 * target role, and the job search then went and looked for exactly that.
 */
describe("the seniority and function guard", () => {
  const evidence = [{ id: "e1", claim: "Analysed requirements for a client engagement." }];
  const entryLevelAnalyst = {
    heldTitles: ["Business Analyst"],
    totalExperienceYears: 0.5,
    allowFunctionChange: false,
  };

  const suggest = (names: string[], guard = entryLevelAnalyst) =>
    groundDirectionSuggestions(
      { suggestions: names.map((name) => ({
        name,
        path: "adjacent" as const,
        rationale: "Grounded in the supplied evidence.",
        evidenceIds: ["e1"],
      })) },
      evidence,
      [],
      guard,
    ).map((suggestion) => suggestion.name);

  it("drops a role above the level the person's years support", () => {
    expect(suggest(["Engagement Manager"])).toEqual([]);
    expect(suggest(["Head of Analytics"])).toEqual([]);
    expect(suggest(["Senior Business Analyst"])).toEqual([]);
  });

  it("drops a different line of work", () => {
    expect(suggest(["Solutions Consultant"])).toEqual([]);
    expect(suggest(["Sales Manager / Solutions Consultant"])).toEqual([]);
    expect(suggest(["Marketing Coordinator"])).toEqual([]);
  });

  it("keeps the directions that actually fit", () => {
    expect(suggest(["Data Analyst", "Product Analyst", "Junior Consultant"]))
      .toEqual(["Data Analyst", "Product Analyst", "Junior Consultant"]);
  });

  /* A change of function is a real thing to want — it just has to be asked for. */
  it("allows a change of function when the person steered for one", () => {
    expect(suggest(["Solutions Consultant"], { ...entryLevelAnalyst, allowFunctionChange: true }))
      .toEqual(["Solutions Consultant"]);
  });

  it("still refuses an over-senior role even when steering was given", () => {
    expect(suggest(["Sales Director"], { ...entryLevelAnalyst, allowFunctionChange: true })).toEqual([]);
  });

  it("leaves suggestions alone when no guard is supplied", () => {
    const ungated = groundDirectionSuggestions(
      { suggestions: [{
        name: "Solutions Consultant",
        path: "adjacent",
        rationale: "Grounded in the supplied evidence.",
        evidenceIds: ["e1"],
      }] },
      evidence,
      [],
    );
    expect(ungated.map((suggestion) => suggestion.name)).toEqual(["Solutions Consultant"]);
  });
});
