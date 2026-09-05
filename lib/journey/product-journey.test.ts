import { describe, expect, it } from "vitest";
import type { ProfileRecord } from "@/lib/types";
import { buildProductJourney, type ProductJourneyInput } from "./product-journey";

const profile: ProfileRecord = {
  id: "user-1",
  full_name: "Example User",
  location: "Singapore",
  headline: "Transformation leader",
  summary: "A meaningful next chapter",
  total_experience_years: 20,
  work_authorisation: "Singapore citizen; open to APAC travel",
  strengths: ["Transformation leadership"],
  exclusions: [],
};

const ready: ProductJourneyInput = {
  profile,
  completeImports: 1,
  roles: 5,
  evidence: 20,
  approvedEvidence: 20,
  pendingEvidence: 0,
  activeLanes: 2,
  activeLaneAllocation: 100,
  searchPreferences: {
    country: "sg",
    countries: ["sg"],
    employmentTypes: [],
    targetLocations: ["Singapore"],
    targetCompanies: [],
    remotePreference: "Flexible",
    sources: [{ id: "official", name: "Employer", url: "https://example.com/jobs", type: "Official", coverage: "Global", trust: "Primary", active: true }],
  },
};

describe("product journey", () => {
  it("uses one three-step definition for full activation", () => {
    const state = buildProductJourney(ready);
    expect(state.activated).toBe(true);
    expect(state.progress).toBe(100);
    expect(state.steps).toHaveLength(3);
    expect(state.steps.map((step) => step.id)).toEqual(["resume", "direction", "search"]);
  });

  it("treats an uploaded résumé as complete with no separate confirmation step", () => {
    // An upload is approved and final — there is no 'confirm' step to clear.
    const state = buildProductJourney({ ...ready, activeLanes: 0, activeLaneAllocation: 0 });
    expect(state.steps.map((step) => step.id as string)).not.toContain("confirm");
    expect(state.steps.find((step) => step.id === "resume")?.complete).toBe(true);
    expect(state.current.id).toBe("direction");
  });

  it("requires search coverage before the dashboard is activated", () => {
    const state = buildProductJourney({
      ...ready,
      searchPreferences: { country: null, countries: [], employmentTypes: [], targetLocations: [], targetCompanies: [], remotePreference: "Flexible", sources: [] },
    });
    expect(state.activated).toBe(false);
    expect(state.current.id).toBe("search");
    expect(state.progress).toBe(67);
  });

  it("counts a country with no cities as search coverage (anywhere in the country)", () => {
    const state = buildProductJourney({
      ...ready,
      searchPreferences: { ...ready.searchPreferences, country: "au", targetLocations: [] },
    });
    expect(state.activated).toBe(true);
    expect(state.steps.find((step) => step.id === "search")?.detail).toContain("AU nationwide");
  });

  it("accepts existing evidence as proof that a résumé was received", () => {
    const state = buildProductJourney({ ...ready, completeImports: 0 });
    expect(state.steps[0].complete).toBe(true);
  });
});
