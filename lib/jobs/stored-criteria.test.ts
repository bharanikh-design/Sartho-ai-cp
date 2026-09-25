import { describe, expect, it } from "vitest";
import { normaliseCriteria, normaliseResults, withScreeningInsight } from "@/lib/jobs/run-search";

const stored = {
  title: "Business Analyst",
  employer: "PwC",
  location: "Sydney",
  url: "https://example.com/jobs/1",
  salary: null,
  postedAt: "2026-09-01",
  source: "Adzuna",
  description: "Analyse things.",
  overallMatch: 71,
  recommendation: "apply",
  matchedSkills: ["stakeholder management"],
  titleFit: 80,
  requirementCoverage: 60,
  closestTitle: "Business Analyst",
  missingRequirements: ["sql"],
};

/*
 * The search_results row is JSON written by whatever version of run-search was
 * deployed at the time. Reading it back with a bare `as SearchCriteria` cast
 * satisfied TypeScript and did nothing at runtime, so the day employmentHinted
 * was added every earlier row lacked the key, the panel read
 * `criteria.employmentHinted.length`, and Find Roles died behind "That page did
 * not load cleanly".
 */
describe("normaliseCriteria", () => {
  it("fills the fields a row written before them cannot have", () => {
    const legacy = {
      country: "au",
      countries: ["au"],
      employmentTypes: ["Full-time"],
      candidateLevel: 1,
      tooSenior: 17,
      countryName: "Australia",
      countrySource: "brief",
      locations: ["Sydney"],
      broadened: false,
      companies: ["PwC"],
      roles: ["Business Analyst"],
      remoteOnly: false,
      providers: ["Adzuna"],
      queriesRun: 6,
      queriesSkipped: 0,
    };

    const criteria = normaliseCriteria(legacy);
    expect(criteria.employmentHinted).toEqual([]);
    expect(criteria.companiesRequested).toBe(0);
    expect(criteria.offFamily).toBe(0);
    expect(criteria.families).toEqual([]);
    /* The experience band arrived after these rows were written, too. */
    expect(criteria.experienceLevel).toBeNull();
    expect(criteria.experienceSource).toBe("unknown");
    expect(criteria.tooMuchExperience).toBe(0);
    expect(criteria.earlyCareerPass).toBe(false);
    /* And nothing the row did carry is lost. */
    expect(criteria.tooSenior).toBe(17);
    expect(criteria.companies).toEqual(["PwC"]);
    expect(criteria.countrySource).toBe("brief");
    expect(criteria.targetRolesRequested).toBe(0);
    expect(criteria.targetRolesSearched).toBe(0);
    expect(criteria.employersChecked).toBe(0);
  });

  it("survives a row that is empty, null, or the wrong shape entirely", () => {
    for (const stored of [null, undefined, {}, [], "nonsense", 42]) {
      const criteria = normaliseCriteria(stored);
      expect(criteria.employmentHinted).toEqual([]);
      expect(criteria.roles).toEqual([]);
      expect(criteria.queriesRun).toBe(0);
      expect(criteria.countrySource).toBe("default");
    }
  });

  it("drops values of the wrong type rather than passing them through", () => {
    const criteria = normaliseCriteria({
      roles: ["Business Analyst", 7, null],
      tooSenior: "many",
      broadened: "yes",
      countrySource: "invented",
      experienceLevel: "3-4",
      experienceSource: "guessed",
    });
    expect(criteria.roles).toEqual(["Business Analyst"]);
    expect(criteria.tooSenior).toBe(0);
    expect(criteria.experienceLevel).toBeNull();
    expect(criteria.experienceSource).toBe("unknown");
    expect(criteria.broadened).toBe(false);
    expect(criteria.countrySource).toBe("default");
  });

  it("preserves provider and employer diagnostics", () => {
    const criteria = normaliseCriteria({
      providerErrors: ["temporary failure"],
      providerTimeouts: [{ name: "provider", count: 2, waitedMs: 8000 }],
      employerPortals: [{ employer: "Example Co", status: "failed", found: 0 }],
    });
    expect(criteria.providerErrors).toEqual(["temporary failure"]);
    expect(criteria.providerTimeouts).toEqual([{ name: "provider", count: 2, waitedMs: 8000 }]);
    expect(criteria.employerPortals).toEqual([{ employer: "Example Co", status: "failed", found: 0 }]);
  });

  it("preserves Candidate Context provenance through stored-search round trips", () => {
    const criteria = normaliseCriteria({
      candidateContextFingerprint: "context-fingerprint-123",
      learnedAffinitySignals: 4,
      directEmployersOnly: true,
      unrecognisedTargets: ["Specialist Role"],
      offMarket: 2,
      semanticRescued: 3,
      semanticExcluded: 4,
      familyWarnings: 5,
    });

    expect(criteria.candidateContextFingerprint).toBe("context-fingerprint-123");
    expect(criteria.learnedAffinitySignals).toBe(4);
    expect(criteria.directEmployersOnly).toBe(true);
    expect(criteria.unrecognisedTargets).toEqual(["Specialist Role"]);
    expect(criteria.offMarket).toBe(2);
    expect(criteria.semanticRescued).toBe(3);
    expect(criteria.semanticExcluded).toBe(4);
    expect(criteria.familyWarnings).toBe(5);
  });
});

/*
 * The matches sit in the same row, written by the same deploys, and were still
 * being read with a bare `as ScoredJobMatch[]`. Two fields on this type —
 * closestIsHeld and requirementsRead — were added after searches had already
 * been stored, so rows missing them exist in production right now.
 */
describe("normaliseResults", () => {
  it("fills the fields a match stored before them cannot have", () => {
    const [match] = normaliseResults([stored]);
    expect(match.closestIsHeld).toBe(false);
    expect(match.requirementsRead).toBe(0);
    /* And nothing the row did carry is lost. */
    expect(match.title).toBe("Business Analyst");
    expect(match.overallMatch).toBe(71);
    expect(match.recommendation).toBe("apply");
    expect(match.matchedSkills).toEqual(["stakeholder management"]);
    expect(match.salary).toBeNull();
    expect(match.screeningInsight).toBeNull();
  });

  it("survives a column that is empty, null, or the wrong shape entirely", () => {
    for (const value of [null, undefined, {}, "nonsense", 42, [null, 7, "x"]]) {
      expect(normaliseResults(value)).toEqual([]);
    }
  });

  it("drops a match that could not be rendered or clicked", () => {
    expect(normaliseResults([{ ...stored, title: "" }])).toEqual([]);
    expect(normaliseResults([{ ...stored, url: undefined }])).toEqual([]);
    /* A good match beside a broken one still arrives. */
    expect(normaliseResults([{ ...stored, url: "" }, stored])).toHaveLength(1);
  });

  it("falls back to review for a recommendation it does not recognise", () => {
    expect(normaliseResults([{ ...stored, recommendation: "maybe" }])[0].recommendation).toBe("review");
    expect(normaliseResults([{ ...stored, recommendation: "skip" }])[0].recommendation).toBe("skip");
  });

  it("drops values of the wrong type rather than passing them through", () => {
    const [match] = normaliseResults([{
      ...stored,
      overallMatch: "high",
      matchedSkills: ["sql", 7, null],
      employer: 12,
    }]);
    expect(match.overallMatch).toBe(0);
    expect(match.matchedSkills).toEqual(["sql"]);
    expect(match.employer).toBeNull();
  });

  it("preserves semantic Job Context across stored-search round trips", () => {
    const [match] = normaliseResults([{
      ...stored,
      semanticContext: {
        function: "Enterprise service management",
        specialties: ["ServiceNow", "ITSM"],
        seniority: "director",
        roleShape: "delivery_leadership",
        primaryOutcome: "Lead enterprise service transformation",
        responsibilities: ["Own delivery"],
        mandatoryExpertise: ["ServiceNow"],
        domainContext: ["Enterprise platforms"],
      },
      semanticFit: {
        relation: "aligned",
        confidence: "high",
        reason: "The role is directly aligned with the candidate's ServiceNow delivery direction.",
        conflictDimensions: [],
        supportingEvidenceRefs: ["evidence-1"],
      },
      semanticContextFingerprint: "context-12345678",
    }]);

    expect(match.semanticContext?.specialties).toEqual(["ServiceNow", "ITSM"]);
    expect(match.semanticFit?.relation).toBe("aligned");
    expect(match.semanticContextFingerprint).toBe("context-12345678");
  });

  it("preserves Search Relevance V2 tier and rescue provenance", () => {
    const [match] = normaliseResults([{
      ...stored,
      relevanceTier: "possible",
      relevanceReason: "Service assurance is credible adjacent ITSM work.",
      semanticRescued: true,
    }]);

    expect(match.relevanceTier).toBe("possible");
    expect(match.relevanceReason).toContain("Service assurance");
    expect(match.semanticRescued).toBe(true);
  });

  it("drops malformed semantic context rather than crashing stored Search", () => {
    const [match] = normaliseResults([{
      ...stored,
      semanticContext: { function: 7 },
      semanticFit: { relation: "certainly" },
    }]);

    expect(match.semanticContext).toBeUndefined();
    expect(match.semanticFit).toBeUndefined();
  });
});

describe("withScreeningInsight", () => {
  it("annotates without changing the authoritative score or recommendation", () => {
    const match = normaliseResults([{
      ...stored,
      titleFit: 0,
      overallMatch: 18,
      recommendation: "skip",
    }])[0];
    const annotated = withScreeningInsight(match, "Review the title mismatch before applying.");

    expect(annotated.screeningInsight).toBe("Review the title mismatch before applying.");
    expect(annotated.overallMatch).toBe(18);
    expect(annotated.recommendation).toBe("skip");
    expect(annotated.titleFit).toBe(0);
    expect(annotated.matchedSkills).toEqual(match.matchedSkills);
  });
});

/*
 * Why the query loop stopped, which the page used to get wrong on every run.
 *
 * Four reasons funnelled into one counter and the page called all of them
 * "time limit". A search that found twenty-five roles, covered every lane and
 * stopped because it was finished reported itself as starved.
 */
describe("why the search stopped asking", () => {
  it("keeps the reason through a round trip", () => {
    const criteria = normaliseCriteria({
      queriesRun: 5,
      queriesSkipped: 22,
      queriesStoppedBecause: "enough_results",
    });
    expect(criteria.queriesStoppedBecause).toBe("enough_results");
  });

  it("keeps the other two reasons apart", () => {
    expect(normaliseCriteria({ queriesStoppedBecause: "budget" }).queriesStoppedBecause).toBe("budget");
    expect(normaliseCriteria({ queriesStoppedBecause: "no_providers" }).queriesStoppedBecause).toBe("no_providers");
  });

  it("reads a row written before the reason existed as unknown, not as a stall", () => {
    /* Every search stored before this deploy, which must not start claiming one. */
    expect(normaliseCriteria({ queriesRun: 6, queriesSkipped: 0 }).queriesStoppedBecause).toBeUndefined();
  });

  it("refuses a value it does not recognise", () => {
    expect(normaliseCriteria({ queriesStoppedBecause: "vibes" }).queriesStoppedBecause).toBeUndefined();
  });

  it("says nothing when the loop ran to the end", () => {
    expect(normaliseCriteria({ queriesRun: 27, queriesSkipped: 0 }).queriesStoppedBecause).toBeUndefined();
  });
});
