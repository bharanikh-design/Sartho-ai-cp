import { beforeEach, describe, expect, it, vi } from "vitest";

const getCareerWorkspace = vi.fn();
const getSearchPreferences = vi.fn();
const getCandidateInteractions = vi.fn();

vi.mock("@/lib/data/career", () => ({
  getCareerWorkspace: (...args: unknown[]) => getCareerWorkspace(...args),
}));
vi.mock("@/lib/data/search", () => ({
  getSearchPreferences: (...args: unknown[]) => getSearchPreferences(...args),
}));
vi.mock("@/lib/data/interaction-memory", () => ({
  getCandidateInteractions: (...args: unknown[]) => getCandidateInteractions(...args),
}));

const { loadCandidateWorkflowContext } = await import("@/lib/context/candidate-workflow");

beforeEach(() => {
  vi.clearAllMocks();
  getCareerWorkspace.mockResolvedValue({
    profile: {
      id: "user-1",
      full_name: "Example",
      location: "Singapore",
      headline: "Service Delivery Leader",
      summary: "Enterprise ITSM leader.",
      total_experience_years: 15,
      work_authorisation: "Singapore",
      strengths: [],
      exclusions: [],
    },
    roles: [],
    evidence: [],
    lanes: [{
      id: "lane-1",
      user_id: "user-1",
      name: "Service Delivery Director",
      weight: 100,
      priority: 1,
      active: true,
    }],
  });
  getSearchPreferences.mockResolvedValue({
    country: "sg",
    countries: ["sg"],
    employmentTypes: ["Full-time"],
    targetLocations: ["Singapore"],
    targetCompanies: [],
    experienceLevel: null,
    remotePreferences: ["Hybrid"],
    sources: [],
    directEmployersOnly: false,
  });
});

describe("Candidate Workflow resilience", () => {
  it("continues with Career Truth and explicit intent when Interaction Memory fails", async () => {
    getCandidateInteractions.mockRejectedValue(new Error("interaction store unavailable"));

    const result = await loadCandidateWorkflowContext({} as never, "user-1");

    expect(result.candidateContext.explicitIntent.targetRoles[0]?.value.name)
      .toBe("Service Delivery Director");
    expect(result.candidateContext.explicitIntent.countries[0]?.value).toBe("sg");
    expect(result.candidateContext.learnedAffinity.signals).toEqual([]);
  });

  it("still consumes Interaction Memory when it is healthy", async () => {
    getCandidateInteractions.mockResolvedValue([]);

    const result = await loadCandidateWorkflowContext({} as never, "user-1");

    expect(result.candidateContext.explicitIntent.targetRoles).toHaveLength(1);
    expect(getCandidateInteractions).toHaveBeenCalledWith({}, "user-1");
  });
});
