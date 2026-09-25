import { beforeEach, describe, expect, it, vi } from "vitest";

const getCareerWorkspace = vi.fn();
const getResumeImports = vi.fn();
const getSearchPreferences = vi.fn();

vi.mock("@/lib/data/career", () => ({
  getCareerWorkspace: (...args: unknown[]) => getCareerWorkspace(...args),
  getResumeImports: (...args: unknown[]) => getResumeImports(...args),
}));
vi.mock("@/lib/data/search", () => ({
  getSearchPreferences: (...args: unknown[]) => getSearchPreferences(...args),
}));

const { loadProductJourney } = await import("@/lib/journey/load-product-journey");

beforeEach(() => {
  vi.clearAllMocks();
  getCareerWorkspace.mockResolvedValue({
    profile: {
      id: "user-1",
      full_name: "Example User",
      location: "Singapore",
      headline: "Transformation Leader",
      summary: "Experienced transformation leader.",
      total_experience_years: 15,
      work_authorisation: "Singapore",
      strengths: ["Transformation leadership"],
      exclusions: [],
    },
    roles: [{ id: "role-1" }],
    evidence: [{
      id: "evidence-1",
      approval_status: "approved",
    }],
    lanes: [{
      id: "lane-1",
      active: true,
      weight: 100,
      priority: 1,
      name: "Service Delivery Director",
    }],
  });
  getResumeImports.mockResolvedValue([{ id: "resume-1", status: "complete" }]);
});

describe("Journey resilience", () => {
  it("keeps Resume and Career Direction progress when Search Preferences are unavailable", async () => {
    getSearchPreferences.mockRejectedValue(new Error("search preferences unavailable"));

    const result = await loadProductJourney({} as never, "user-1");

    expect(result.journey.steps.find((step) => step.id === "resume")?.complete).toBe(true);
    expect(result.journey.steps.find((step) => step.id === "direction")?.complete).toBe(true);
    expect(result.journey.steps.find((step) => step.id === "search")?.complete).toBe(false);
    expect(result.journey.current.id).toBe("search");
  });

  it("uses Career Evidence when resume-import metadata is unavailable", async () => {
    getResumeImports.mockRejectedValue(new Error("resume import metadata unavailable"));
    getSearchPreferences.mockResolvedValue({
      country: "sg",
      countries: ["sg"],
      employmentTypes: [],
      targetLocations: ["Singapore"],
      targetCompanies: [],
      experienceLevel: null,
      remotePreferences: ["Hybrid"],
      sources: [{ id: "official", name: "Employer", url: "https://example.com", type: "Official", coverage: "Global", trust: "Primary", active: true }],
      directEmployersOnly: false,
    });

    const result = await loadProductJourney({} as never, "user-1");

    expect(result.journey.steps.find((step) => step.id === "resume")?.complete).toBe(true);
    expect(result.journey.steps.find((step) => step.id === "search")?.complete).toBe(true);
  });

  it("uses the real Search Preferences when healthy", async () => {
    getSearchPreferences.mockResolvedValue({
      country: "sg",
      countries: ["sg"],
      employmentTypes: [],
      targetLocations: ["Singapore"],
      targetCompanies: [],
      experienceLevel: null,
      remotePreferences: ["Hybrid"],
      sources: [{ id: "official", name: "Employer", url: "https://example.com", type: "Official", coverage: "Global", trust: "Primary", active: true }],
      directEmployersOnly: false,
    });

    const result = await loadProductJourney({} as never, "user-1");
    expect(result.journey.steps.find((step) => step.id === "search")?.complete).toBe(true);
  });
});
