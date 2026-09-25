import { beforeEach, describe, expect, it, vi } from "vitest";

const loadProductJourney = vi.fn();
const withJwtClockSkewRetry = vi.fn();

vi.mock("@/lib/journey/load-product-journey", () => ({
  loadProductJourney: (...args: unknown[]) => loadProductJourney(...args),
}));
vi.mock("@/lib/supabase/retry", () => ({
  withJwtClockSkewRetry: (...args: unknown[]) => withJwtClockSkewRetry(...args),
}));

const { loadDashboardData } = await import("@/lib/dashboard/load-dashboard");

function fakeSupabase(applicationResult: { data: unknown[] | null; error: unknown }) {
  return {
    from(table: string) {
      if (table !== "applications") throw new Error("Unexpected table " + table);
      return {
        select() {
          return {
            eq: async () => applicationResult,
          };
        },
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadProductJourney.mockResolvedValue({
    journey: { progress: 67, steps: [], current: { id: "search" } },
    workspace: { profile: null, roles: [], evidence: [], lanes: [] },
    imports: [],
    searchPreferences: {},
  });
});

describe("Dashboard resilience", () => {
  it("keeps the core Journey alive when Jobs are unavailable", async () => {
    withJwtClockSkewRetry.mockResolvedValue({
      data: null,
      error: new Error("jobs unavailable"),
    });

    const result = await loadDashboardData(
      fakeSupabase({ data: [{ job_id: "job-1" }], error: null }) as never,
      "user-1",
    );

    expect(result.journeyResult.journey.progress).toBe(67);
    expect(result.jobs).toEqual([]);
    expect(result.applications).toHaveLength(1);
    expect(result.unavailable).toEqual(["jobs"]);
  });

  it("keeps Jobs when Applications are unavailable", async () => {
    withJwtClockSkewRetry.mockResolvedValue({
      data: [{ id: "job-1", title: "Role" }],
      error: null,
    });

    const result = await loadDashboardData(
      fakeSupabase({ data: null, error: new Error("applications unavailable") }) as never,
      "user-1",
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.applications).toEqual([]);
    expect(result.unavailable).toEqual(["applications"]);
  });

  it("marks both derived datasets unavailable without losing Journey", async () => {
    withJwtClockSkewRetry.mockRejectedValue(new Error("jobs transport failed"));

    const result = await loadDashboardData(
      fakeSupabase({ data: null, error: new Error("applications failed") }) as never,
      "user-1",
    );

    expect(result.journeyResult.journey.progress).toBe(67);
    expect(result.jobs).toEqual([]);
    expect(result.applications).toEqual([]);
    expect(result.unavailable).toEqual(["jobs", "applications"]);
  });
});
