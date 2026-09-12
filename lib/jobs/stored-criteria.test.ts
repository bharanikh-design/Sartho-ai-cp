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
