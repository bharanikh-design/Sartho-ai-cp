import { describe, expect, it } from "vitest";
import { mapAdzunaResult } from "./search-provider";

describe("mapAdzunaResult", () => {
  it("maps a complete Adzuna record into Sartho's shape", () => {
    const result = mapAdzunaResult({
      title: "  Senior Engagement Manager  ",
      company: { display_name: "Example Corp" },
      location: { display_name: "Sydney" },
      description: "Lead client engagements across the region.",
      redirect_url: "https://www.adzuna.com/land/ad/123",
      salary_min: 120000,
      salary_max: 150000,
      created: "2026-09-01T00:00:00Z",
    });

    expect(result).toEqual({
      title: "Senior Engagement Manager",
      employer: "Example Corp",
      location: "Sydney",
      description: "Lead client engagements across the region.",
      url: "https://www.adzuna.com/land/ad/123",
      salary: "120,000–150,000",
      postedAt: "2026-09-01T00:00:00Z",
      source: "Adzuna",
    });
  });

  it("drops a record missing a title, link or description", () => {
    expect(mapAdzunaResult({ company: { display_name: "X" }, description: "d", redirect_url: "https://x" })).toBeNull();
    expect(mapAdzunaResult({ title: "T", description: "d" })).toBeNull();
    expect(mapAdzunaResult({ title: "T", redirect_url: "https://x" })).toBeNull();
  });

  it("leaves optional fields null and omits an absent salary", () => {
    const result = mapAdzunaResult({
      title: "Analyst",
      description: "Do the analysis.",
      redirect_url: "https://x/1",
    });
    expect(result?.employer).toBeNull();
    expect(result?.location).toBeNull();
    expect(result?.salary).toBeNull();
    expect(result?.postedAt).toBeNull();
  });
});
