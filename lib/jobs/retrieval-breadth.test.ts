import { describe, expect, it } from "vitest";
import type { JobSearchQuery } from "@/lib/jobs/search-provider";
import { retrievalBreadthComplete } from "@/lib/jobs/run-search";

const queries: JobSearchQuery[] = [
  { keywords: "Engagement Manager", targetRole: "Engagement Manager", country: "sg" },
  { keywords: "Practice Lead", targetRole: "Practice Lead", country: "sg" },
  { keywords: "Service Assurance Director", suggested: true, country: "sg" },
  { keywords: "IT Governance Manager", suggested: true, country: "sg" },
  { keywords: "Engagement Manager", targetRole: "Engagement Manager", employer: "Accenture", country: "sg" },
];

describe("retrievalBreadthComplete", () => {
  it("does not stop merely because explicit target roles were covered", () => {
    expect(retrievalBreadthComplete(
      queries,
      new Set(["engagement manager", "practice lead"]),
      new Set(),
    )).toBe(false);
  });

  it("does not stop while one semantic expansion remains unsearched", () => {
    expect(retrievalBreadthComplete(
      queries,
      new Set(["engagement manager", "practice lead"]),
      new Set(["service assurance director"]),
    )).toBe(false);
  });

  it("allows early stop after explicit targets and bounded semantic expansion both ran", () => {
    expect(retrievalBreadthComplete(
      queries,
      new Set(["engagement manager", "practice lead"]),
      new Set(["service assurance director", "it governance manager"]),
    )).toBe(true);
  });

  it("does not require aggregator employer combinations before declaring breadth complete", () => {
    const withoutCompanyCoverage = retrievalBreadthComplete(
      queries,
      new Set(["engagement manager", "practice lead"]),
      new Set(["service assurance director", "it governance manager"]),
    );
    expect(withoutCompanyCoverage).toBe(true);
  });
});
