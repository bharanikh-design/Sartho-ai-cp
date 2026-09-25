import { randomUUID } from 'node:crypto';
import {
  failWorkflowStage,
  finishWorkflowStage,
  runWorkflowTraceScope,
  startWorkflowStage,
  type WorkflowTraceSnapshot,
} from './workflow-trace';

export const WORKFLOW_DISPATCHER_VERSION = 'sartho-workflow-dispatcher-2026-09-25.1';

export type WorkflowDispatchMode = 'immediate' | 'queued';
export type WorkflowDispatchStatus = 'completed' | 'failed' | 'rejected';

export type WorkflowDispatchResult<T> = {
  version: typeof WORKFLOW_DISPATCHER_VERSION;
  mode: WorkflowDispatchMode;
  status: WorkflowDispatchStatus;
  workflowId: string;
  traceId: string;
  trace: WorkflowTraceSnapshot | null;
  result?: T;
  errorClass?: string;
  reason?: string;
};

export type WorkflowDispatcherHealth = {
  version: typeof WORKFLOW_DISPATCHER_VERSION;
  mode: 'immediate';
  queueConfigured: false;
  status: 'READY';
  reason: string;
};

function safeErrorClass(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string') {
    return ((error as { name: string }).name || 'Error').slice(0, 80);
  }
  return 'Error';
}

export function workflowDispatcherHealth(): WorkflowDispatcherHealth {
  return {
    version: WORKFLOW_DISPATCHER_VERSION,
    mode: 'immediate',
    queueConfigured: false,
    status: 'READY',
    reason: 'Immediate dispatcher is active; queued backend is intentionally not enabled by this foundation PR.',
  };
}

/**
 * Single dispatch seam for work that is immediate today and queueable later.
 * Queued mode rejects explicitly so no caller can believe durable async execution happened when it did not.
 */
export async function dispatchWorkflow<T>(
  input: {
    workflowName: string;
    mode?: WorkflowDispatchMode;
    workflowId?: string;
    traceId?: string;
    now?: () => number;
  },
  work: () => Promise<T> | T,
): Promise<WorkflowDispatchResult<T>> {
  const mode = input.mode || 'immediate';
  const workflowId = input.workflowId || randomUUID();
  const traceId = input.traceId || randomUUID();

  if (mode === 'queued') {
    return {
      version: WORKFLOW_DISPATCHER_VERSION,
      mode,
      status: 'rejected',
      workflowId,
      traceId,
      trace: null,
      reason: 'queue_backend_not_configured',
    };
  }

  const outcome = await runWorkflowTraceScope(input.workflowName, async () => {
    const stage = startWorkflowStage('dispatch:immediate');
    try {
      const result = await work();
      finishWorkflowStage(stage);
      return result;
    } catch (error: unknown) {
      failWorkflowStage(stage, error);
      throw error;
    }
  }, { workflowId, traceId, now: input.now });

  if (outcome.ok) {
    return {
      version: WORKFLOW_DISPATCHER_VERSION,
      mode,
      status: 'completed',
      workflowId,
      traceId,
      trace: outcome.trace,
      result: outcome.result,
    };
  }

  return {
    version: WORKFLOW_DISPATCHER_VERSION,
    mode,
    status: 'failed',
    workflowId,
    traceId,
    trace: outcome.trace,
    errorClass: safeErrorClass(outcome.error),
  };
}
