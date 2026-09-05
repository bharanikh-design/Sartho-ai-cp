import { describe, expect, it } from "vitest";
import { alignToLanes, overallMatchScore, scoreOpportunity, withLane } from "./opportunity-score";
import type { JobAnalysis } from "./analyse-job";
import type { CareerRoleRecord, EvidenceRecord, TargetLaneRecord } from "@/lib/types";

function lane(partial: Partial<TargetLaneRecord> = {}): TargetLaneRecord {
  return { id: "l", user_id: "u", name: "Transformation Director", weight: 50, priority: 1, active: true, ...partial };
}

/* Only the fields overallMatchScore reads; the rest of JobAnalysis is irrelevant here. */
const analysis = (titleFit: number, requirementCoverage: number, evidenceBacking: number) =>
  ({ titleFit, requirementCoverage, evidenceBacking } as JobAnalysis);

describe("alignToLanes", () => {
  it("matches a role whose title carries the lane's words", () => {
    const result = alignToLanes("Regional Transformation Director", "Lead change across the region.", [lane({ name: "Transformation Director" })]);
    expect(result?.lane.name).toBe("Transformation Director");
    expect(result?.overlap).toBe(1);
  });

  it("returns null when the role sits outside every stated priority", () => {
    expect(alignToLanes("Junior Pastry Chef", "Bake croissants at dawn.", [lane({ name: "Transformation Director" })])).toBeNull();
  });

  it("ignores inactive lanes", () => {
    expect(alignToLanes("Transformation Director", "", [lane({ active: false })])).toBeNull();
  });

  it("prefers the higher-priority lane when two both match", () => {
    const result = alignToLanes("Head of Data and Transformation", "", [
      lane({ id: "a", name: "Data Lead", priority: 3, weight: 30 }),
      lane({ id: "b", name: "Transformation Lead", priority: 1, weight: 70 }),
    ]);
    expect(result?.lane.id).toBe("b");
  });
});

describe("overallMatchScore", () => {
  it("blends the three legs when no priority matches", () => {
    // 100×0.35 + 50×0.40 + 80×0.25 = 35 + 20 + 20
    expect(overallMatchScore(analysis(100, 50, 80), null)).toBe(75);
  });

  it("scores zero only when every leg is zero", () => {
    expect(overallMatchScore(analysis(0, 0, 0), null)).toBe(0);
    expect(overallMatchScore(analysis(100, 0, 0), null)).toBe(35);
  });

  it("lifts a role that lands in a weighted priority lane", () => {
    const inPriority = overallMatchScore(analysis(50, 50, 50), { lane: lane({ weight: 100 }), overlap: 1 });
    const outside = overallMatchScore(analysis(50, 50, 50), null);
    expect(inPriority).toBeGreaterThan(outside);
  });

  it("keeps the priority lift small — wanting a role is not evidence", () => {
    const lift = overallMatchScore(analysis(50, 50, 50), { lane: lane({ weight: 100 }), overlap: 1 })
      - overallMatchScore(analysis(50, 50, 50), null);
    expect(lift).toBeLessThanOrEqual(10);
  });

  it("never exceeds 100", () => {
    expect(overallMatchScore(analysis(100, 100, 100), { lane: lane({ weight: 100 }), overlap: 1 })).toBe(100);
  });
});

describe("withLane", () => {
  it("names the matched priority on the stored analysis", () => {
    expect(withLane(analysis(10, 10, 10), { lane: lane({ name: "Ops Director" }), overlap: 1 }).primaryLane).toBe("Ops Director");
  });

  it("leaves the analysis untouched when nothing matched", () => {
    expect(withLane(analysis(10, 10, 10), null).primaryLane).toBeUndefined();
  });
});

/*
 * The regression this rewrite exists for.
 *
 * A Business Analyst opened a Business Analyst advert and Sartho said 0%,
 * because the score came only from literal hits on their category tags and the
 * advert never says the word "Consulting". Job title reached the score in no
 * way at all.
 */
describe("scoreOpportunity end to end", () => {
  const role = (title: string): CareerRoleRecord => ({
    id: `r-${title}`, user_id: "u", employer: "Connecting Plots", title,
    location: "Sydney", start_date: "2024-01-01", end_date: null, is_current: true, summary: null,
  } as CareerRoleRecord);

  const evidenceItem = (claim: string, domains: string[]): EvidenceRecord => ({
    id: `e-${claim.slice(0, 8)}`, user_id: "u", career_role_id: "r-Business Analyst",
    claim, context: null, period_label: null, metrics: [], domains,
    confidence: "high", approval_status: "approved", safe_for_resume: true,
    career_role: null,
  } as unknown as EvidenceRecord);

  const jobDescription = `
    Construct the RTM to be able to track business requirements through design, build, test and deploy phases.
    Assist in backlog grooming and identifying the MVP for each wave.
    Assist in the identification and creation of test and use cases. It is expected that the BA services will
    deliver a BRD and RTM artifact and required inputs into other discovery phase artifacts.
    You will work with stakeholders across the programme to elicit and document functional requirements.
  `;

  it("no longer returns zero for a Business Analyst reading a Business Analyst role", () => {
    const scored = scoreOpportunity(
      "Business Analyst",
      jobDescription,
      [evidenceItem("Analysed live retail datasets and framed strategic recommendations", ["Consulting"])],
      [role("Business Analyst")],
      [],
    );

    expect(scored.overallMatch).toBeGreaterThan(30);
    expect(scored.recommendation).not.toBe("skip");
    expect(scored.breakdown.titleFit).toBe(100);
  });

  it("scores higher still when the evidence covers what the advert asks for", () => {
    const withRequirementsEvidence = scoreOpportunity(
      "Business Analyst",
      jobDescription,
      [
        evidenceItem("Gathered business requirements and produced the BRD for a payments release", ["Consulting"]),
        evidenceItem("Ran backlog grooming with stakeholders each sprint", ["Consulting"]),
      ],
      [role("Business Analyst")],
      [],
    );
    const withoutIt = scoreOpportunity(
      "Business Analyst",
      jobDescription,
      [evidenceItem("Served customers on the shop floor and managed stock", ["Retail"])],
      [role("Business Analyst")],
      [],
    );

    expect(withRequirementsEvidence.overallMatch).toBeGreaterThan(withoutIt.overallMatch);
    expect(withRequirementsEvidence.breakdown.requirementCoverage)
      .toBeGreaterThan(withoutIt.breakdown.requirementCoverage);
  });

  it("still says skip for a role genuinely unrelated to the person", () => {
    const scored = scoreOpportunity(
      "Pastry Chef",
      "We are hiring a pastry chef for our flagship restaurant. You will bake croissants at dawn and run the dessert section for a busy service every evening.",
      [evidenceItem("Gathered business requirements and produced the BRD", ["Consulting"])],
      [role("Business Analyst")],
      [],
    );
    expect(scored.recommendation).toBe("skip");
    expect(scored.overallMatch).toBeLessThan(20);
  });
});
