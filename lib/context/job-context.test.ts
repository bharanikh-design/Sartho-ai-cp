import { describe, expect, it } from "vitest";
import type { CandidateContext } from "@/lib/context/candidate-context";
import {
  groundSemanticAssessments,
  type SemanticJobInput,
} from "@/lib/context/job-context";

const context: CandidateContext = {
  schemaVersion: 1,
  generatedAt: "2026-09-25T00:00:00Z",
  careerTruth: {
    headline: null,
    summary: null,
    yearsExperience: null,
    workAuthorisation: null,
    heldRoles: [{
      value: { title: "ServiceNow Engagement Manager", employer: "Example", current: true },
      authority: "career_truth",
      source: "master_resume",
      confidence: 1,
      evidenceRefs: ["role-1"],
    }],
    capabilities: [{
      value: { name: "Service management", strength: "core", evidenceCount: 4, current: true },
      authority: "career_truth",
      source: "approved_evidence",
      confidence: 1,
      evidenceRefs: ["evidence-1"],
    }],
    explicitExclusions: [],
  },
  explicitIntent: {
    targetRoles: [{
      value: { name: "ServiceNow Delivery Director", weight: 100, priority: 1 },
      authority: "explicit_intent",
      source: "career_direction",
      confidence: 1,
      evidenceRefs: ["lane-1"],
    }],
    countries: [],
    locations: [],
    companies: [],
    employmentTypes: [],
    remotePreferences: [],
    experienceLevel: null,
    directEmployersOnly: null,
  },
  learnedAffinity: { signals: [] },
};

const jobs: SemanticJobInput[] = [{
  key: "job-1",
  title: "SAP FICO Project Manager & Solution Architect",
  employer: "Example",
  location: "Singapore",
  description: "Lead SAP S/4HANA finance transformation with deep FICO solution architecture responsibility.",
}];

function raw(key = "job-1") {
  return {
    jobs: [{
      key,
      context: {
        function: "Enterprise applications delivery",
        specialties: ["SAP FICO", "SAP S/4HANA"],
        seniority: "senior_manager",
        roleShape: "delivery_leadership",
        primaryOutcome: "Deliver SAP finance transformation",
        responsibilities: ["Lead implementation", "Own solution architecture"],
        mandatoryExpertise: ["SAP FICO", "SAP S/4HANA"],
        domainContext: ["Enterprise finance systems"],
      },
      fit: {
        relation: "conflict",
        confidence: "high",
        reason: "Generic project leadership overlaps, but the role requires SAP finance architecture rather than ServiceNow/ITSM delivery.",
        conflictDimensions: ["specialism"],
        supportingEvidenceRefs: ["role-1", "evidence-1", "invented-ref"],
      },
    }],
  };
}

describe("Semantic Job Context grounding", () => {
  it("keeps the semantic job meaning while grounding candidate evidence refs", () => {
    const result = groundSemanticAssessments(context, jobs, raw());
    const assessment = result.get("job-1");

    expect(assessment?.context.specialties).toEqual(["SAP FICO", "SAP S/4HANA"]);
    expect(assessment?.fit.relation).toBe("conflict");
    expect(assessment?.fit.supportingEvidenceRefs).toEqual(["role-1", "evidence-1"]);
  });

  it("drops results for jobs the caller never supplied", () => {
    const result = groundSemanticAssessments(context, jobs, raw("job-never-requested"));
    expect(result.size).toBe(0);
  });

  it("keeps only the first result for a duplicated key", () => {
    const first = raw().jobs[0];
    const duplicate = {
      ...first,
      fit: {
        ...first.fit,
        relation: "aligned",
        reason: "Duplicate answer that must not replace the first result.",
      },
    };

    const result = groundSemanticAssessments(context, jobs, { jobs: [first, duplicate] });
    expect(result.get("job-1")?.fit.relation).toBe("conflict");
  });

  it("rejects a model response that tries to become a scoring engine", () => {
    const illegal = raw();
    const withScore = {
      ...illegal,
      jobs: illegal.jobs.map((job) => ({ ...job, overallMatch: 98 })),
    };

    expect(() => groundSemanticAssessments(context, jobs, withScore)).toThrow();
  });

  it("never processes more than the bounded semantic shortlist", () => {
    const manyJobs = Array.from({ length: 9 }, (_, index) => ({
      ...jobs[0],
      key: `job-${index + 1}`,
    }));
    const manyRaw = {
      jobs: manyJobs.slice(0, 8).map((job) => ({
        ...raw(job.key).jobs[0],
        key: job.key,
      })),
    };

    const result = groundSemanticAssessments(context, manyJobs, manyRaw);
    expect(result.size).toBe(8);
    expect(result.has("job-9")).toBe(false);
  });
});
