import { beforeEach, describe, expect, it, vi } from "vitest";

const rescoreSavedJobs = vi.fn();
const prepareCareerConductor = vi.fn();

vi.mock("@/lib/matching/rescore", () => ({
  rescoreSavedJobs: (...args: unknown[]) => rescoreSavedJobs(...args),
}));
vi.mock("@/lib/workflow/career-conductor", () => ({
  prepareCareerConductor: (...args: unknown[]) => prepareCareerConductor(...args),
}));

const { propagateCandidateMutation } = await import("./propagate-candidate-mutation");

beforeEach(() => {
  vi.clearAllMocks();
  rescoreSavedJobs.mockResolvedValue(undefined);
  prepareCareerConductor.mockResolvedValue({ contextFingerprint: "fingerprint" });
});

describe("candidate mutation propagation policy", () => {
  const supabase = {} as never;

  it("Career Truth refreshes scores and invalidates deep requirement mappings", async () => {
    await propagateCandidateMutation(supabase, "user-1", "career_truth");

    expect(rescoreSavedJobs).toHaveBeenCalledWith(
      supabase,
      "user-1",
      { invalidateDeepAnalysis: true },
    );
    expect(prepareCareerConductor).not.toHaveBeenCalled();
  });

  it("Career Direction refreshes scores without invalidating factual requirement mappings", async () => {
    await propagateCandidateMutation(supabase, "user-1", "career_direction");

    expect(rescoreSavedJobs).toHaveBeenCalledWith(supabase, "user-1");
    expect(prepareCareerConductor).not.toHaveBeenCalled();
  });

  it("Search Brief advances Candidate Context without rewriting saved opportunity scores", async () => {
    await propagateCandidateMutation(supabase, "user-1", "search_brief");

    expect(prepareCareerConductor).toHaveBeenCalledWith(supabase, "user-1");
    expect(rescoreSavedJobs).not.toHaveBeenCalled();
  });

  it("derived propagation failure never rejects the authoritative source mutation", async () => {
    rescoreSavedJobs.mockRejectedValue(new Error("derived refresh failed"));

    await expect(
      propagateCandidateMutation(supabase, "user-1", "career_truth"),
    ).resolves.toBeUndefined();
  });
});
