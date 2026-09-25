import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateContext } from "@/lib/context/candidate-context";

const generateStructuredJson = vi.fn();

vi.mock("@/lib/ai/provider", () => ({
  generateStructuredJson: (...args: unknown[]) => generateStructuredJson(...args),
}));

const { assessSemanticJobsResilient } = await import("@/lib/context/job-context");

const context: CandidateContext = {
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
  learnedAffinity: { signals: [] },
};

function responseFor(request: { prompt: string }) {
  const payload = JSON.parse(request.prompt) as { jobs: Array<{ key: string; title: string }> };
  return {
    jobs: payload.jobs.map((job) => ({
      key: job.key,
      context: {
        function: "Enterprise service management",
        specialties: ["ITSM"],
        seniority: "manager",
        roleShape: "delivery_leadership",
        primaryOutcome: "Operate and improve enterprise services",
        responsibilities: ["Lead service delivery"],
        mandatoryExpertise: ["ITSM"],
        domainContext: ["Enterprise technology"],
      },
      fit: {
        relation: "adjacent",
        confidence: "medium",
        reason: job.title + " is credible adjacent service-management work.",
        conflictDimensions: [],
        supportingEvidenceRefs: [],
      },
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assessSemanticJobsResilient", () => {
  it("preserves successful chunks when one chunk fails", async () => {
    let call = 0;
    generateStructuredJson.mockImplementation(async (request: { prompt: string }) => {
      call += 1;
      if (call === 2) throw new Error("provider timeout");
      return responseFor(request);
    });

    const jobs = Array.from({ length: 7 }, (_, index) => ({
      key: "job-" + (index + 1),
      title: "Service role " + (index + 1),
      description: "Lead enterprise IT service management and continual service improvement across business services.",
    }));

    const outcome = await assessSemanticJobsResilient(context, jobs, {
      chunkSize: 3,
      chunkTimeoutMs: 5_000,
    });

    expect(outcome.chunksAttempted).toBe(3);
    expect(outcome.chunksFailed).toBe(1);
    expect(outcome.assessments.size).toBe(4);
    expect([...outcome.failed]).toEqual(["job-4", "job-5", "job-6"]);
    expect(outcome.assessments.has("job-1")).toBe(true);
    expect(outcome.assessments.has("job-7")).toBe(true);
  });

  it("reports the whole bounded shortlist as failed without throwing when every chunk fails", async () => {
    generateStructuredJson.mockRejectedValue(new Error("provider unavailable"));

    const jobs = Array.from({ length: 6 }, (_, index) => ({
      key: "job-" + (index + 1),
      title: "Service role " + (index + 1),
      description: "Lead enterprise IT service management and service delivery across a regional environment.",
    }));

    const outcome = await assessSemanticJobsResilient(context, jobs, {
      chunkSize: 3,
      chunkTimeoutMs: 5_000,
    });

    expect(outcome.assessments.size).toBe(0);
    expect(outcome.chunksAttempted).toBe(2);
    expect(outcome.chunksFailed).toBe(2);
    expect(outcome.failed.size).toBe(6);
    expect(outcome.attempted.size).toBe(6);
  });
});
