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

  /*
   * The opposite failure, reported live: a ServiceNow Solution Architect with
   * twelve years behind them saw a single role on the page beside "AI could not
   * create grounded suggestions right now".
   *
   * "Architect" carries no seniority word, so the guard read them as mid-level
   * and dropped every leadership direction the model had been asked to propose.
   * On a round where the model proposed only leadership moves, nothing survived
   * at all — and an empty grounded set is thrown, which is the error the page
   * was showing.
   */
  describe("a senior individual contributor", () => {
    const seniorArchitect = {
      heldTitles: ["ServiceNow Solution Architect"],
      totalExperienceYears: 12,
      allowFunctionChange: false,
    };

    it("is offered the leadership moves a decade of evidence supports", () => {
      expect(suggest(["ITSM Manager", "Service Delivery Director", "ServiceNow Delivery Lead"], seniorArchitect))
        .toEqual(["ITSM Manager", "Service Delivery Director", "ServiceNow Delivery Lead"]);
    });

    it("still refuses a different line of work", () => {
      expect(suggest(["Sales Manager"], seniorArchitect)).toEqual([]);
    });
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

/*
 * What happens when the guard removes everything.
 *
 * The guard itself is right, and worth not maligning: an eight-year Senior
 * Business Analyst is still offered Data Manager, Analytics Manager, Lead
 * Business Analyst and Principal Analyst. It drops Head of Data and Chief
 * Data Officer on seniority — more than one grade up — and sales or marketing
 * moves on function, both of which are the rules doing their job.
 *
 * The failure is narrower and it is a tail: on a round where the model happens
 * to propose ONLY roles that each trip one of those rules, the whole set
 * vanishes and the page says "AI could not create grounded suggestions right
 * now" — which is false. The model worked. We discarded all of it.
 *
 * The route's recovery is to ground a second time with the guard omitted and
 * label what comes back. These tests fix both halves: the guard is what empties
 * it, and omitting the guard is what recovers it WITHOUT loosening the evidence
 * rule, which must never bend.
 */
describe("recovering a set the guard emptied", () => {
  const evidence = [
    { id: "e1", claim: "Owned analytics delivery across a retail estate." },
    { id: "e2", claim: "Ran the reporting function for three business units." },
  ];
  const analyst = {
    heldTitles: ["Senior Business Analyst"],
    totalExperienceYears: 8,
    allowFunctionChange: false,
  };
  /* One trips seniority, the other trips function. Neither survives. */
  const allBlocked = { suggestions: [
    { name: "Chief Data Officer", path: "stretch" as const, rationale: "Builds on multi-unit reporting ownership.", evidenceIds: ["e2"] },
    { name: "Enterprise Sales Manager", path: "adjacent" as const, rationale: "Transfers stakeholder work into revenue.", evidenceIds: ["e1"] },
  ] };

  it("is emptied by the guard, which is the bug the page was reporting", () => {
    expect(groundDirectionSuggestions(allBlocked, evidence, [], analyst)).toEqual([]);
  });

  it("keeps the in-family progressions the guard was never meant to block", () => {
    /* Named so a future tightening cannot quietly take these away too. */
    for (const name of ["Data Manager", "Analytics Manager", "Lead Business Analyst", "Principal Analyst"]) {
      const kept = groundDirectionSuggestions(
        { suggestions: [{ name, path: "direct", rationale: "Supported by delivery evidence.", evidenceIds: ["e1"] }] },
        evidence, [], analyst,
      );
      expect(kept.map((item) => item.name), name).toEqual([name]);
    }
  });

  it("comes back once the guard is dropped", () => {
    const recovered = groundDirectionSuggestions(allBlocked, evidence, []);
    expect(recovered.map((item) => item.name)).toEqual(["Chief Data Officer", "Enterprise Sales Manager"]);
    /* Still carrying their citations — the recovery is not a loosening of that. */
    expect(recovered.every((item) => item.evidenceIds.length > 0)).toBe(true);
  });

  it("still refuses a fabrication with the guard dropped", () => {
    /*
     * The line the recovery must not cross. Relaxing "this may not suit you"
     * is a judgement call; relaxing "you have never done this" is a lie, and
     * an empty page is better than one.
     */
    const invented = { suggestions: [
      { name: "Chief Technology Officer", path: "stretch" as const, rationale: "Nothing supplied supports this.", evidenceIds: ["not-a-real-id"] },
    ] };
    expect(groundDirectionSuggestions(invented, evidence, [])).toEqual([]);
  });
});
