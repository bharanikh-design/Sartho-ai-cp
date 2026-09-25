import { describe, expect, it } from "vitest";
import {
  createWorkflowTraceId,
  normaliseWorkflowTraceId,
  workflowTraceFromMetadata,
} from "@/lib/observability/workflow-trace";

describe("workflow trace ids", () => {
  it("creates stable-format opaque ids", () => {
    const first = createWorkflowTraceId();
    const second = createWorkflowTraceId();

    expect(first).toMatch(/^wft_[0-9a-f-]{36}$/i);
    expect(second).toMatch(/^wft_[0-9a-f-]{36}$/i);
    expect(first).not.toBe(second);
  });

  it("accepts only valid workflow trace ids", () => {
    const valid = createWorkflowTraceId();
    expect(normaliseWorkflowTraceId(valid)).toBe(valid);
    expect(normaliseWorkflowTraceId("trace-123")).toBeUndefined();
    expect(normaliseWorkflowTraceId(null)).toBeUndefined();
  });

  it("recovers a trace from persisted metadata without trusting arbitrary objects", () => {
    const valid = createWorkflowTraceId();
    expect(workflowTraceFromMetadata({ workflowTraceId: valid })).toBe(valid);
    expect(workflowTraceFromMetadata({ workflowTraceId: "bad" })).toBeUndefined();
    expect(workflowTraceFromMetadata("bad")).toBeUndefined();
  });
});
