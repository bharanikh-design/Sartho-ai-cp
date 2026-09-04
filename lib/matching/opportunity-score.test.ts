import { describe, expect, it } from "vitest";
import { alignToLanes, overallMatchScore, withLane } from "./opportunity-score";
import type { JobAnalysis } from "./analyse-job";
import type { TargetLaneRecord } from "@/lib/types";

function lane(partial: Partial<TargetLaneRecord> = {}): TargetLaneRecord {
  return { id: "l", user_id: "u", name: "Transformation Director", weight: 50, priority: 1, active: true, ...partial };
}

// Only the two fields overallMatchScore reads; the rest of JobAnalysis is irrelevant here.
const analysis = (evidenceBacking: number, coverage: number) => ({ evidenceBacking, coverage } as JobAnalysis);

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
  it("blends evidence backing and coverage when no priority matches", () => {
    expect(overallMatchScore(analysis(80, 50), null)).toBe(68);
  });

  it("lifts a role that lands in a weighted priority lane", () => {
    const inPriority = overallMatchScore(analysis(50, 50), { lane: lane({ weight: 100 }), overlap: 1 });
    const outside = overallMatchScore(analysis(50, 50), null);
    expect(inPriority).toBeGreaterThan(outside);
  });

  it("never exceeds 100", () => {
    expect(overallMatchScore(analysis(100, 100), { lane: lane({ weight: 100 }), overlap: 1 })).toBe(100);
  });
});

describe("withLane", () => {
  it("names the matched priority on the stored analysis", () => {
    expect(withLane(analysis(10, 10), { lane: lane({ name: "Ops Director" }), overlap: 1 }).primaryLane).toBe("Ops Director");
  });

  it("leaves the analysis untouched when nothing matched", () => {
    expect(withLane(analysis(10, 10), null).primaryLane).toBeUndefined();
  });
});
