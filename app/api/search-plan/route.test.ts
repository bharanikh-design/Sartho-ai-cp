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
    const parsed = searchPlanSchema.safeParse({
      country: "AU",
      targetLocations: ["Sydney"],
      targetCompanies: ["PwC", "Deloitte"],
      remotePreference: "Flexible",
      sources: [source],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.country).toBe("au");
      expect(parsed.data.targetCompanies).toEqual(["PwC", "Deloitte"]);
    }
  });

  it("accepts a country with no cities — that means anywhere in the country", () => {
    const parsed = searchPlanSchema.safeParse({
      country: "in",
      targetLocations: [],
      remotePreference: "Remote",
      sources: [source],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.targetCompanies).toEqual([]);
  });

  it("still accepts a brief from before the country model", () => {
    expect(searchPlanSchema.safeParse({
      targetLocations: ["Singapore"],
      remotePreference: "Flexible",
      sources: [source],
    }).success).toBe(true);
  });

  it("normalises uk to gb and nulls an unknown market", () => {
    const uk = searchPlanSchema.safeParse({ country: "UK", targetLocations: [], remotePreference: "Flexible", sources: [source] });
    expect(uk.success && uk.data.country).toBe("gb");
    const unknown = searchPlanSchema.safeParse({ country: "zz", targetLocations: [], remotePreference: "Flexible", sources: [source] });
    expect(unknown.success && unknown.data.country).toBeNull();
  });

  it("rejects a brief with no active source", () => {
    expect(searchPlanSchema.safeParse({
      targetLocations: ["Singapore"],
      remotePreference: "Flexible",
      sources: [{ ...source, active: false }],
    }).success).toBe(false);
  });
});
