import { describe, expect, it } from "vitest";
import { groundRoleRankings } from "./direction-ranking";

const evidence = [
  { id: "e1", claim: "Led a 40-country ITSM rollout" },
  { id: "e2", claim: "Ran ServiceNow pre-sales for APAC" },
];
const lanes = ["ITSM Transformation Lead", "ServiceNow Engagement Director", "Data Science Manager"];

function rank(rankings: Parameters<typeof groundRoleRankings>[0]["rankings"]) {
  return groundRoleRankings({ rankings }, evidence, lanes);
}

describe("groundRoleRankings", () => {
  it("keeps a strong verdict that cites real evidence", () => {
    const [top] = rank([{ name: "ITSM Transformation Lead", match: "strong", reason: "Direct ITSM ownership.", evidenceIds: ["e1"] }]);
    expect(top).toMatchObject({ name: "ITSM Transformation Lead", match: "strong" });
    expect(top.supportingSignals).toContain("Led a 40-country ITSM rollout");
  });

  it("demotes a strong claim with no surviving evidence to stretch", () => {
    const result = rank([{ name: "ITSM Transformation Lead", match: "strong", reason: "Feels right.", evidenceIds: ["nope"] }]);
    expect(result.find((r) => r.name === "ITSM Transformation Lead")?.match).toBe("stretch");
  });

  it("ignores a verdict for a role not on the board", () => {
    const result = rank([{ name: "Astronaut", match: "strong", reason: "Why not.", evidenceIds: ["e1"] }]);
    expect(result.some((r) => r.name === "Astronaut")).toBe(false);
  });

  it("gives every lane a verdict — omitted ones are unclear", () => {
    const result = rank([{ name: "ITSM Transformation Lead", match: "strong", reason: "ITSM.", evidenceIds: ["e1"] }]);
    expect(result).toHaveLength(lanes.length);
    expect(result.find((r) => r.name === "Data Science Manager")?.match).toBe("unclear");
  });

  it("orders strongest first, unclear last", () => {
    const result = rank([
      { name: "Data Science Manager", match: "stretch", reason: "Adjacent analytics.", evidenceIds: [] },
      { name: "ITSM Transformation Lead", match: "strong", reason: "ITSM.", evidenceIds: ["e1"] },
      { name: "ServiceNow Engagement Director", match: "moderate", reason: "Pre-sales base.", evidenceIds: ["e2"] },
    ]);
    expect(result.map((r) => r.match)).toEqual(["strong", "moderate", "stretch"]);
  });
});
