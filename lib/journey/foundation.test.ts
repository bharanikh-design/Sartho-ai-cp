import { describe, expect, it } from "vitest";
import { getFoundationState } from "./foundation";

describe("getFoundationState", () => {
  it("starts a new user at resume upload", () => {
    const state = getFoundationState({ completedImports: 0, processingImports: 0, roles: 0, evidence: 0, approvedEvidence: 0, rejectedEvidence: 0 });

    expect(state.currentStep).toBe(1);
    expect(state.progress).toBe(0);
    expect(state.steps.map((step) => step.state)).toEqual(["current", "upcoming", "upcoming"]);
  });

  it("shows extraction as current while a stored import is processing", () => {
    const state = getFoundationState({ completedImports: 0, processingImports: 1, roles: 0, evidence: 0, approvedEvidence: 0, rejectedEvidence: 0 });

    expect(state.currentStep).toBe(2);
    expect(state.progress).toBe(33);
    expect(state.readiness).toBe("Resume received");
  });

  it("moves extracted evidence to explicit confirmation", () => {
    const state = getFoundationState({ completedImports: 1, processingImports: 0, roles: 4, evidence: 12, approvedEvidence: 3, rejectedEvidence: 1 });

    expect(state.currentStep).toBe(3);
    expect(state.progress).toBe(78);
    expect(state.steps[2]).toMatchObject({ state: "current", detail: "8 records still need a decision" });
  });

  it("only completes when every claim has a decision and at least one is approved", () => {
    const ready = getFoundationState({ completedImports: 1, processingImports: 0, roles: 2, evidence: 5, approvedEvidence: 4, rejectedEvidence: 1 });
    const allRejected = getFoundationState({ completedImports: 1, processingImports: 0, roles: 2, evidence: 5, approvedEvidence: 0, rejectedEvidence: 5 });

    expect(ready.progress).toBe(100);
    expect(ready.readiness).toBe("Foundation ready");
    expect(allRejected.progress).toBe(99);
    expect(allRejected.readiness).toBe("Ready for confirmation");
    expect(allRejected.steps[2].state).toBe("current");
  });
});
