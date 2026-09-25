import { describe, expect, it } from "vitest";
import type { CandidateContext } from "@/lib/context/candidate-context";
import { searchIntentFromCandidateContext } from "@/lib/context/candidate-workflow";

const signal = <T>(value: T, authority: "career_truth" | "explicit_intent" | "learned_affinity" = "explicit_intent") => ({
  value,
  authority,
  source: authority === "explicit_intent" ? "search_brief" as const : "interaction" as const,
  confidence: 1,
  evidenceRefs: [],
});

describe("Candidate Context -> Search handoff", () => {
  it("passes explicit search intent through one typed contract", () => {
    const context = {
      schemaVersion: 1,
      generatedAt: "2026-09-25T00:00:00Z",
      careerTruth: {
        headline: null,
        summary: null,
        yearsExperience: null,
        workAuthorisation: null,
        heldRoles: [],
        capabilities: [],
        explicitExclusions: [],
      },
      explicitIntent: {
        targetRoles: [signal({ name: "ServiceNow Delivery Director", weight: 90, priority: 1 })],
        countries: [signal("sg")],
        locations: [signal("Singapore")],
        companies: [signal("Fujitsu")],
        employmentTypes: [signal("Full-time")],
        remotePreferences: [signal("Hybrid")],
        experienceLevel: signal("15-plus"),
        directEmployersOnly: signal(true),
      },
      learnedAffinity: {
        signals: [{
          ...signal({
            concept: "ITSM Transformation Lead",
            polarity: "positive" as const,
            reason: "Imported repeatedly.",
          }, "learned_affinity"),
          confidence: 0.6,
        }],
      },
    } as CandidateContext;

    expect(searchIntentFromCandidateContext(context)).toEqual({
      roles: ["ServiceNow Delivery Director"],
      countries: ["sg"],
      locations: ["Singapore"],
      companies: ["Fujitsu"],
      employmentTypes: ["Full-time"],
      remotePreferences: ["Hybrid"],
      experienceLevel: "15-plus",
      directEmployersOnly: true,
      learnedAffinitySignals: 1,
    });
  });

  it("reports learned affinity without silently turning it into search filters", () => {
    const context = {
      schemaVersion: 1,
      generatedAt: "2026-09-25T00:00:00Z",
      careerTruth: {
        headline: null,
        summary: null,
        yearsExperience: null,
        workAuthorisation: null,
        heldRoles: [],
        capabilities: [],
        explicitExclusions: [],
      },
      explicitIntent: {
        targetRoles: [],
        countries: [],
        locations: [],
        companies: [],
        employmentTypes: [],
        remotePreferences: [],
        experienceLevel: null,
        directEmployersOnly: null,
      },
      learnedAffinity: {
        signals: [{
          ...signal({
            concept: "SAP FICO Architect",
            polarity: "positive" as const,
            reason: "One imported role.",
          }, "learned_affinity"),
          confidence: 0.4,
        }],
      },
    } as CandidateContext;

    const handoff = searchIntentFromCandidateContext(context);
    expect(handoff.roles).toEqual([]);
    expect(handoff.companies).toEqual([]);
    expect(handoff.learnedAffinitySignals).toBe(1);
  });
});
