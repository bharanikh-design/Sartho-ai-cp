import { randomUUID } from "node:crypto";

const TRACE_PREFIX = "wft_";
const TRACE_PATTERN = /^wft_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createWorkflowTraceId(): string {
  return TRACE_PREFIX + randomUUID();
}

export function normaliseWorkflowTraceId(value: unknown): string | undefined {
  return typeof value === "string" && TRACE_PATTERN.test(value) ? value : undefined;
}

export function workflowTraceFromRuleAnalysis(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  return normaliseWorkflowTraceId((value as { workflowTraceId?: unknown }).workflowTraceId);
}

export function logWorkflowTrace(
  stage: string,
  workflowTraceId: string,
  details: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (process.env.NODE_ENV === "test") return;
  console.info("workflow_trace", JSON.stringify({
    workflowTraceId,
    stage,
    ...details,
  }));
}
