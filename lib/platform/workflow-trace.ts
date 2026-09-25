import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const WORKFLOW_TRACE_VERSION = 'sartho-workflow-trace-2026-09-25.1';

export type WorkflowTraceStatus = 'running' | 'succeeded' | 'failed';
export type WorkflowStageStatus = 'started' | 'succeeded' | 'failed' | 'recovered';

export type WorkflowTraceStage = {
  name: string;
  status: WorkflowStageStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  warnings: string[];
  retries: number;
  failure?: string;
  recovery?: string;
};

export type WorkflowTraceSnapshot = {
  version: typeof WORKFLOW_TRACE_VERSION;
  workflowId: string;
  traceId: string;
  workflowName: string;
  status: WorkflowTraceStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  stages: WorkflowTraceStage[];
};

type WorkflowTraceState = {
  now: () => number;
  workflowStartedAtMs: number;
  stageStartedAtMs: number[];
  trace: WorkflowTraceSnapshot;
};

export type WorkflowTraceOutcome<T> =
  | { ok: true; result: T; trace: WorkflowTraceSnapshot }
  | { ok: false; error: unknown; trace: WorkflowTraceSnapshot };

const traceStorage = new AsyncLocalStorage<WorkflowTraceState>();
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function boundedDuration(startedAtMs: number, finishedAtMs: number): number {
  return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(finishedAtMs - startedAtMs)));
}

function safeLabel(value: string, fallback: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._:/ -]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return cleaned || fallback;
}

function safeNote(value: string): string {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function safeErrorClass(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string') {
    return safeLabel((error as { name: string }).name, 'Error');
  }
  return 'Error';
}

function cloneTrace(trace: WorkflowTraceSnapshot): WorkflowTraceSnapshot {
  return JSON.parse(JSON.stringify(trace)) as WorkflowTraceSnapshot;
}

function finishOpenStages(state: WorkflowTraceState, status: 'succeeded' | 'failed', error?: unknown): void {
  for (let index = 0; index < state.trace.stages.length; index += 1) {
    const stage = state.trace.stages[index];
    if (stage.finishedAt) continue;
    const finishedAtMs = state.now();
    stage.status = status;
    stage.finishedAt = iso(finishedAtMs);
    stage.durationMs = boundedDuration(state.stageStartedAtMs[index] || state.workflowStartedAtMs, finishedAtMs);
    if (status === 'failed') stage.failure = safeErrorClass(error);
  }
}

function completeTrace(state: WorkflowTraceState, status: 'succeeded' | 'failed', error?: unknown): void {
  finishOpenStages(state, status, error);
  const finishedAtMs = state.now();
  state.trace.status = status;
  state.trace.finishedAt = iso(finishedAtMs);
  state.trace.durationMs = boundedDuration(state.workflowStartedAtMs, finishedAtMs);
}

export async function runWorkflowTraceScope<T>(
  workflowName: string,
  work: () => Promise<T> | T,
  options: { workflowId?: string; traceId?: string; now?: () => number } = {},
): Promise<WorkflowTraceOutcome<T>> {
  const existing = traceStorage.getStore();
  if (existing) {
    try {
      const result = await work();
      return { ok: true, result, trace: cloneTrace(existing.trace) };
    } catch (error: unknown) {
      return { ok: false, error, trace: cloneTrace(existing.trace) };
    }
  }

  const now = options.now || Date.now;
  const startedAtMs = now();
  const state: WorkflowTraceState = {
    now,
    workflowStartedAtMs: startedAtMs,
    stageStartedAtMs: [],
    trace: {
      version: WORKFLOW_TRACE_VERSION,
      workflowId: options.workflowId || randomUUID(),
      traceId: options.traceId || randomUUID(),
      workflowName: safeLabel(workflowName, 'workflow'),
      status: 'running',
      startedAt: iso(startedAtMs),
      stages: [],
    },
  };

  return traceStorage.run(state, async () => {
    try {
      const result = await work();
      completeTrace(state, 'succeeded');
      return { ok: true, result, trace: cloneTrace(state.trace) };
    } catch (error: unknown) {
      completeTrace(state, 'failed', error);
      return { ok: false, error, trace: cloneTrace(state.trace) };
    }
  });
}

export async function withWorkflowTraceScope<T>(
  workflowName: string,
  work: () => Promise<T> | T,
  options: { workflowId?: string; traceId?: string; now?: () => number } = {},
): Promise<T> {
  const outcome = await runWorkflowTraceScope(workflowName, work, options);
  if (outcome.ok) return outcome.result;
  throw outcome.error;
}

export function currentWorkflowTraceIds(): { workflowId: string; traceId: string } | null {
  const state = traceStorage.getStore();
  if (!state) return null;
  return { workflowId: state.trace.workflowId, traceId: state.trace.traceId };
}

export function currentWorkflowTraceSnapshot(): WorkflowTraceSnapshot | null {
  const state = traceStorage.getStore();
  return state ? cloneTrace(state.trace) : null;
}

export function startWorkflowStage(name: string): number | null {
  const state = traceStorage.getStore();
  if (!state) return null;
  const startedAtMs = state.now();
  const stage: WorkflowTraceStage = {
    name: safeLabel(name, 'stage'),
    status: 'started',
    startedAt: iso(startedAtMs),
    warnings: [],
    retries: 0,
  };
  state.trace.stages.push(stage);
  const index = state.trace.stages.length - 1;
  state.stageStartedAtMs[index] = startedAtMs;
  return index;
}

export function finishWorkflowStage(stageRef: number | null, input: { recovery?: string; warnings?: string[] } = {}): void {
  const state = traceStorage.getStore();
  if (!state || stageRef == null) return;
  const stage = state.trace.stages[stageRef];
  if (!stage || stage.finishedAt) return;
  const finishedAtMs = state.now();
  stage.status = input.recovery ? 'recovered' : 'succeeded';
  stage.finishedAt = iso(finishedAtMs);
  stage.durationMs = boundedDuration(state.stageStartedAtMs[stageRef] || state.workflowStartedAtMs, finishedAtMs);
  if (input.recovery) stage.recovery = safeNote(input.recovery);
  for (const warning of input.warnings || []) noteWorkflowWarning(stageRef, warning);
}

export function failWorkflowStage(stageRef: number | null, error: unknown, input: { recovery?: string } = {}): void {
  const state = traceStorage.getStore();
  if (!state || stageRef == null) return;
  const stage = state.trace.stages[stageRef];
  if (!stage || stage.finishedAt) return;
  const finishedAtMs = state.now();
  stage.status = input.recovery ? 'recovered' : 'failed';
  stage.finishedAt = iso(finishedAtMs);
  stage.durationMs = boundedDuration(state.stageStartedAtMs[stageRef] || state.workflowStartedAtMs, finishedAtMs);
  stage.failure = safeErrorClass(error);
  if (input.recovery) stage.recovery = safeNote(input.recovery);
}

export function noteWorkflowWarning(stageRef: number | null, warning: string): void {
  const state = traceStorage.getStore();
  if (!state || stageRef == null) return;
  const stage = state.trace.stages[stageRef];
  const safe = safeNote(warning);
  if (!stage || !safe || stage.warnings.length >= 10) return;
  stage.warnings.push(safe);
}

export function noteWorkflowRetry(stageRef: number | null): void {
  const state = traceStorage.getStore();
  if (!state || stageRef == null) return;
  const stage = state.trace.stages[stageRef];
  if (!stage) return;
  stage.retries = Math.min(100, stage.retries + 1);
}
