import { describe, expect, it } from "vitest";
import {
  deriveOutcomeStage,
  isOutcomeReason,
  isTerminalOutcome,
  OUTCOME_REASON_LABELS,
  OUTCOME_REASONS,
  OUTCOME_STAGE_LABELS,
  OUTCOME_STAGES,
} from "./outcome";
import type { JobStatus } from "@/lib/types";

describe("isTerminalOutcome", () => {
  it("is true only for the two recorded endings", () => {
    expect(isTerminalOutcome("rejected")).toBe(true);
    expect(isTerminalOutcome("withdrawn")).toBe(true);
  });

  it("is false for a stage still in motion", () => {
    for (const status of ["saved", "applied", "interview", "offer"] as JobStatus[]) {
      expect(isTerminalOutcome(status)).toBe(false);
    }
  });
});

describe("deriveOutcomeStage", () => {
  it("collapses everything before submission to one bucket", () => {
    expect(deriveOutcomeStage("saved")).toBe("pre_submission");
    expect(deriveOutcomeStage("analysed")).toBe("pre_submission");
    expect(deriveOutcomeStage("approved")).toBe("pre_submission");
  });

  it("maps submitted-but-unheard to screening", () => {
    expect(deriveOutcomeStage("applied")).toBe("screening");
    expect(deriveOutcomeStage("acknowledged")).toBe("screening");
  });

  it("carries the live pipeline stages through unchanged", () => {
    expect(deriveOutcomeStage("assessment")).toBe("assessment");
    expect(deriveOutcomeStage("interview")).toBe("interview");
    expect(deriveOutcomeStage("offer")).toBe("offer");
  });

  it("declines to invent a stage from an already-terminal status", () => {
    // rejected -> withdrawn, or a re-classification: the prior status holds no
    // stage information, so the record must not fabricate one.
    expect(deriveOutcomeStage("rejected")).toBeNull();
    expect(deriveOutcomeStage("withdrawn")).toBeNull();
  });

  it("returns one of the declared stages for every non-terminal status", () => {
    const nonTerminal: JobStatus[] = ["saved", "analysed", "approved", "applied", "acknowledged", "assessment", "interview", "offer"];
    for (const status of nonTerminal) {
      const stage = deriveOutcomeStage(status);
      expect(stage).not.toBeNull();
      expect(OUTCOME_STAGES).toContain(stage);
    }
  });
});

describe("isOutcomeReason", () => {
  it("accepts every declared reason", () => {
    for (const reason of OUTCOME_REASONS) {
      expect(isOutcomeReason(reason)).toBe(true);
    }
  });

  it("rejects anything outside the vocabulary", () => {
    expect(isOutcomeReason("made_up")).toBe(false);
    expect(isOutcomeReason("")).toBe(false);
    expect(isOutcomeReason(null)).toBe(false);
    expect(isOutcomeReason(3)).toBe(false);
  });
});

describe("label coverage", () => {
  it("labels every reason and every stage, so the UI never renders a raw key", () => {
    for (const reason of OUTCOME_REASONS) expect(OUTCOME_REASON_LABELS[reason]).toBeTruthy();
    for (const stage of OUTCOME_STAGES) expect(OUTCOME_STAGE_LABELS[stage]).toBeTruthy();
  });
});
