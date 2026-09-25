import { describe, expect, it } from "vitest";
import type { SemanticJobFit } from "@/lib/types";
import {
  decideSearchRelevance,
  selectSemanticCandidates,
  sortByRelevance,
  type RelevanceCandidate,
} from "@/lib/jobs/search-relevance";

function candidate(
  url: string,
  overrides: Partial<RelevanceCandidate> = {},
): RelevanceCandidate {
  return {
    url,
    overallMatch: 40,
    recommendation: "skip",
    titleFit: 10,
    requirementCoverage: 65,
    applyDirect: false,
    familyWithinReach: false,
    specialistConflict: false,
    semanticAttempted: true,
    ...overrides,
  };
}

function fit(
  relation: SemanticJobFit["relation"],
  reason: string,
  confidence: SemanticJobFit["confidence"] = "high",
): SemanticJobFit {
  return {
    relation,
    confidence,
    reason,
    conflictDimensions: relation === "conflict" ? ["specialism"] : [],
    supportingEvidenceRefs: [],
  };
}

describe("Search Relevance V2", () => {
  it.each([
    ["vp-itsm", "Vice President, ITSM Lead for Service Management Operations"],
    ["service-assurance", "Associate Director, Service Assurance"],
    ["csi", "Asset & CSI Management Analyst"],
    ["governance", "IT Governance & Controls, Associate"],
    ["service-delivery", "Senior Service Delivery Manager"],
  ])("allows semantic understanding to rescue low-title-overlap role %s", (url, title) => {
    const result = decideSearchRelevance(
      candidate(url, { titleFit: 5, familyWithinReach: false, recommendation: "skip" }),
      fit("adjacent", title + " is credible adjacent service-management work.", "high"),
    );

    expect(result.tier).toBe("possible");
    expect(result.rescued).toBe(true);
  });

  it("promotes semantically aligned ITSM work to strong even when title vocabulary was weak", () => {
    const result = decideSearchRelevance(
      candidate("itsm", { titleFit: 15, recommendation: "skip" }),
      fit("aligned", "The work is directly ITSM/service-management leadership."),
    );

    expect(result.tier).toBe("strong");
    expect(result.rescued).toBe(true);
  });

  it("keeps a bounded semantic candidate visible when the semantic layer is unavailable", () => {
    const result = decideSearchRelevance(
      candidate("semantic-timeout", {
        titleFit: 4,
        familyWithinReach: false,
        recommendation: "skip",
        semanticAttempted: true,
      }),
    );

    expect(result.tier).toBe("possible");
    expect(result.rescued).toBe(true);
    expect(result.semanticUsed).toBe(false);
  });

  it("never uses outage fallback to rescue a deterministic specialist conflict", () => {
    const result = decideSearchRelevance(
      candidate("sap-outage", {
        specialistConflict: true,
        semanticAttempted: true,
        titleFit: 20,
        requirementCoverage: 90,
        overallMatch: 35,
      }),
    );

    expect(result.tier).toBe("outside");
    expect(result.rescued).toBe(false);
  });

  it("does not rescue a high-confidence specialist conflict", () => {
    const result = decideSearchRelevance(
      candidate("sap", {
        overallMatch: 35,
        titleFit: 20,
        requirementCoverage: 80,
        recommendation: "skip",
      }),
      fit("conflict", "The role requires SAP FICO/S4HANA architecture, not ServiceNow/ITSM delivery."),
    );

    expect(result.tier).toBe("outside");
    expect(result.rescued).toBe(false);
  });

  it("does not let a low-confidence semantic conflict become a hard rejection", () => {
    const result = decideSearchRelevance(
      candidate("uncertain"),
      fit("conflict", "There may be a specialist mismatch, but the advert is incomplete.", "low"),
    );
    expect(result.tier).toBe("possible");
  });

  it("reserves semantic capacity for jobs old title/family rules would have rejected", () => {
    const candidates = [
      ...Array.from({ length: 10 }, (_, index) =>
        candidate("core-" + index, {
          overallMatch: 90 - index,
          recommendation: "apply",
          titleFit: 80,
          requirementCoverage: 75,
          familyWithinReach: true,
        })),
      candidate("service-assurance", {
        overallMatch: 28,
        titleFit: 4,
        requirementCoverage: 76,
        familyWithinReach: false,
      }),
      candidate("service-delivery", {
        overallMatch: 30,
        titleFit: 8,
        requirementCoverage: 72,
        familyWithinReach: false,
      }),
    ];

    const selected = selectSemanticCandidates(candidates, 8);
    expect(selected.map((item) => item.url)).toContain("service-assurance");
    expect(selected.map((item) => item.url)).toContain("service-delivery");
    expect(selected).toHaveLength(8);
  });

  it("orders strong before possible and hides outside later without changing the numeric score", () => {
    const rows = [
      { overallMatch: 95, relevanceTier: "outside" as const },
      { overallMatch: 55, relevanceTier: "strong" as const },
      { overallMatch: 80, relevanceTier: "possible" as const },
    ];
    expect(sortByRelevance(rows).map((row) => row.relevanceTier))
      .toEqual(["strong", "possible", "outside"]);
  });
});
