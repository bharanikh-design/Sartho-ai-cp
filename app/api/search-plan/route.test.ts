import { describe, expect, it } from "vitest";
import { searchPlanSchema } from "./route";

const source = {
  id: "official",
  name: "Employer careers",
  url: "https://example.com/careers",
  type: "Official",
  coverage: "Singapore",
  trust: "Primary",
  active: true,
};

describe("search plan boundary", () => {
  it("accepts a complete search brief", () => {
    expect(searchPlanSchema.safeParse({
      targetLocations: ["Singapore"],
      remotePreference: "Flexible",
      sources: [source],
    }).success).toBe(true);
  });

  it("rejects a brief with no location or no active source", () => {
    expect(searchPlanSchema.safeParse({
      targetLocations: [],
      remotePreference: "Flexible",
      sources: [source],
    }).success).toBe(false);

    expect(searchPlanSchema.safeParse({
      targetLocations: ["Singapore"],
      remotePreference: "Flexible",
      sources: [{ ...source, active: false }],
    }).success).toBe(false);
  });
});
