import { describe, expect, it } from "vitest";
import { softQuery } from "@/lib/analytics/load-user-table";

describe("Admin telemetry resilience", () => {
  it("returns successful telemetry unchanged", async () => {
    const result = await softQuery(
      "activity",
      async () => ({ data: [{ user_id: "u1" }], error: null }),
      [],
    );

    expect(result.unavailable).toBe(false);
    expect(result.data).toEqual([{ user_id: "u1" }]);
  });

  it("returns the fallback when a telemetry query returns an error", async () => {
    const result = await softQuery(
      "jobs",
      async () => ({ data: null, error: { code: "42P01", message: "table unavailable" } }),
      [],
    );

    expect(result.unavailable).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns the fallback when a telemetry query throws", async () => {
    const result = await softQuery(
      "profiles",
      async () => {
        throw new Error("network failure");
      },
      [],
    );

    expect(result.unavailable).toBe(true);
    expect(result.data).toEqual([]);
  });
});
