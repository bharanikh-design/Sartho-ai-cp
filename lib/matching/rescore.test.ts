import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareCareerConductor = vi.fn();
const evaluateOpportunity = vi.fn();

vi.mock("@/lib/workflow/career-conductor", () => ({
  prepareCareerConductor: (...args: unknown[]) => prepareCareerConductor(...args),
  evaluateOpportunity: (...args: unknown[]) => evaluateOpportunity(...args),
}));

const { rescoreSavedJobs } = await import("./rescore");

type UpdateRecord = { table: string; payload: Record<string, unknown> };

function fakeSupabase() {
  const updates: UpdateRecord[] = [];
  const deletes: Array<{ table: string; ids: string[] }> = [];

  const job = {
    id: "job-1",
    title: "ServiceNow Delivery Director",
    raw_description: "Lead enterprise ITSM transformation and ServiceNow delivery.",
    status: "saved",
    rule_analysis: {
      recommendation: "apply",
      confidence: "high",
      matchedSignals: [],
      cautionSignals: [],
      explanation: "old",
      semanticContext: {
        function: "Enterprise service management",
        specialties: ["ServiceNow", "ITSM"],
        seniority: "director",
        roleShape: "delivery_leadership",
        primaryOutcome: "Lead service transformation",
        responsibilities: ["Own delivery"],
        mandatoryExpertise: ["ServiceNow"],
        domainContext: ["Enterprise platforms"],
      },
      semanticFit: {
        relation: "aligned",
        confidence: "high",
        reason: "Old candidate-specific fit",
        conflictDimensions: [],
        supportingEvidenceRefs: ["old-evidence"],
      },
      semanticContextFingerprint: "old-fingerprint",
      scoringContextFingerprint: "old-fingerprint",
      workflowTraceId: "wft_123e4567-e89b-42d3-a456-426614174000",
    },
  };

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: () => ({
            eq: async () => ({ data: [job], error: null }),
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push({ table, payload });
            return {
              eq: () => ({
                in: async () => ({ error: null }),
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }

      if (table === "job_requirements") {
        return {
          delete: () => ({
            in: async (_column: string, ids: string[]) => {
              deletes.push({ table, ids });
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, updates, deletes };
}

beforeEach(() => {
  vi.clearAllMocks();
  prepareCareerConductor.mockResolvedValue({
    contextFingerprint: "new-fingerprint",
    workflow: {},
  });
  evaluateOpportunity.mockReturnValue({
    recommendation: "review",
    overallMatch: 54,
    evidenceBacking: 61,
    analysis: {
      recommendation: "review",
      confidence: "medium",
      primaryStrength: "ServiceNow",
      coverage: 60,
      requirementCoverage: 55,
      evidenceBacking: 61,
      titleFit: 70,
      closestTitle: "ServiceNow Engagement Manager",
      seniorityGap: 1,
      specialistConflict: false,
      missingRequirements: [],
      requirementsRead: 4,
      closestIsHeld: true,
      matchedSignals: ["ServiceNow"],
      cautionSignals: [],
      matchedSkills: [],
      unusedStrengths: [],
      explanation: "new canonical score",
    },
  });
});

describe("saved opportunity propagation", () => {
  it("invalidates stale deep analysis and stamps the new Candidate Context fingerprint", async () => {
    const { supabase, updates, deletes } = fakeSupabase();

    await rescoreSavedJobs(supabase as never, "user-1", { invalidateDeepAnalysis: true });

    expect(deletes).toEqual([{ table: "job_requirements", ids: ["job-1"] }]);

    const invalidation = updates.find((entry) => entry.payload.deep_analysis_status === "not_started");
    expect(invalidation?.payload).toMatchObject({
      deep_analysis_status: "not_started",
      deep_analysis_summary: null,
      deep_analysed_at: null,
    });

    const scoreUpdate = updates.find((entry) => entry.payload.overall_match === 54);
    expect(scoreUpdate?.payload).toMatchObject({
      recommendation: "review",
      overall_match: 54,
      technical_heaviness: 61,
    });

    const analysis = scoreUpdate?.payload.rule_analysis as Record<string, unknown>;
    expect(analysis.scoringContextFingerprint).toBe("new-fingerprint");
    expect(analysis.semanticContext).toBeDefined();
    expect(analysis.semanticFit).toBeUndefined();
    expect(analysis.semanticContextFingerprint).toBeUndefined();
    expect(analysis.workflowTraceId).toBe("wft_123e4567-e89b-42d3-a456-426614174000");
  });

  it("uses the Career Conductor once for the whole rescore batch", async () => {
    const { supabase } = fakeSupabase();

    await rescoreSavedJobs(supabase as never, "user-1");

    expect(prepareCareerConductor).toHaveBeenCalledTimes(1);
    expect(prepareCareerConductor).toHaveBeenCalledWith(supabase, "user-1");
    expect(evaluateOpportunity).toHaveBeenCalledTimes(1);
  });
});
