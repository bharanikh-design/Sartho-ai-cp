import { describe, expect, it } from "vitest";
import {
  approvedEvidenceIds,
  groundAssessment,
  groundConfidence,
  keepGroundedIds,
} from "./grounding";

describe("approvedEvidenceIds", () => {
  it("indexes the rows that were sent to the model", () => {
    const approved = approvedEvidenceIds([{ id: "a" }, { id: "b" }]);
    expect(approved.has("a")).toBe(true);
    expect(approved.has("b")).toBe(true);
    expect(approved.has("c")).toBe(false);
  });

  it("is empty when no evidence was supplied", () => {
    expect(approvedEvidenceIds([]).size).toBe(0);
  });
});

describe("keepGroundedIds", () => {
  const approved = approvedEvidenceIds([{ id: "a" }, { id: "b" }]);

  it("keeps citations that name supplied evidence", () => {
    expect(keepGroundedIds(["a", "b"], approved)).toEqual(["a", "b"]);
  });

  it("drops an id the model invented", () => {
    expect(keepGroundedIds(["a", "made-up"], approved)).toEqual(["a"]);
  });

  it("drops an id belonging to evidence that was never sent", () => {
    // The decisive case: a real UUID from another user's record must not
    // survive simply because it looks well-formed.
    expect(keepGroundedIds(["someone-elses-record"], approved)).toEqual([]);
  });

  it("de-duplicates repeated citations", () => {
    expect(keepGroundedIds(["a", "a", "b", "a"], approved)).toEqual(["a", "b"]);
  });

  it("preserves the model's ordering", () => {
    expect(keepGroundedIds(["b", "a"], approved)).toEqual(["b", "a"]);
  });

  it("returns nothing when no evidence was approved", () => {
    expect(keepGroundedIds(["a", "b"], approvedEvidenceIds([]))).toEqual([]);
  });
});

describe("groundAssessment", () => {
  it("keeps an assessment that still has evidence behind it", () => {
    expect(groundAssessment("met", ["a"])).toBe("met");
    expect(groundAssessment("partially_met", ["a"])).toBe("partially_met");
  });

  it("downgrades an unsupported claim of capability to unknown", () => {
    expect(groundAssessment("met", [])).toBe("unknown");
    expect(groundAssessment("partially_met", [])).toBe("unknown");
  });

  it("leaves honest negatives alone — they assert nothing to prove", () => {
    expect(groundAssessment("not_met", [])).toBe("not_met");
    expect(groundAssessment("unknown", [])).toBe("unknown");
  });
});

describe("groundConfidence", () => {
  it("keeps stated confidence when evidence survived", () => {
    expect(groundConfidence("high", ["a"])).toBe("high");
  });

  it("floors confidence to low when nothing survived", () => {
    expect(groundConfidence("high", [])).toBe("low");
    expect(groundConfidence("medium", [])).toBe("low");
  });
});
