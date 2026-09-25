import type { SupabaseClient } from "@supabase/supabase-js";

export type DurableAiOperationKind = "deep_analysis" | "resume_generation";
export type DurableAiOperationStatus = "running" | "succeeded" | "failed";

export type DurableAiOperationRow = {
  id: string;
  user_id: string;
  operation: DurableAiOperationKind;
  resource_id: string | null;
  request_id: string;
  workflow_trace_id: string | null;
  status: DurableAiOperationStatus;
  attempt_count: number;
  started_at: string;
  finished_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  result_ref: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export const DURABLE_OPERATION_STALE_MS = 3 * 60 * 1000;

export function classifyExistingOperation(
  row: Pick<DurableAiOperationRow, "status" | "started_at">,
  now = Date.now(),
  staleMs = DURABLE_OPERATION_STALE_MS,
): "already_succeeded" | "already_running" | "reclaim" {
  if (row.status === "succeeded") return "already_succeeded";
  if (row.status === "running") {
    const started = new Date(row.started_at).getTime();
    if (Number.isFinite(started) && now - started < staleMs) return "already_running";
  }
  return "reclaim";
}

function rowFrom(data: unknown): DurableAiOperationRow {
  return data as DurableAiOperationRow;
}

async function readExisting(
  supabase: SupabaseClient,
  userId: string,
  operation: DurableAiOperationKind,
  requestId: string,
): Promise<DurableAiOperationRow | null> {
  const { data, error } = await supabase
    .from("durable_ai_operations")
    .select("*")
    .eq("user_id", userId)
    .eq("operation", operation)
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowFrom(data) : null;
}

async function readRunningForResource(
  supabase: SupabaseClient,
  userId: string,
  operation: DurableAiOperationKind,
  resourceId: string,
): Promise<DurableAiOperationRow | null> {
  const { data, error } = await supabase
    .from("durable_ai_operations")
    .select("*")
    .eq("user_id", userId)
    .eq("operation", operation)
    .eq("resource_id", resourceId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? rowFrom(data) : null;
}

export async function beginDurableAiOperation(
  supabase: SupabaseClient,
  userId: string,
  input: {
    operation: DurableAiOperationKind;
    resourceId?: string | null;
    requestId: string;
    workflowTraceId?: string | null;
  },
): Promise<{
  state: "started" | "already_running" | "already_succeeded";
  row: DurableAiOperationRow;
}> {
  const now = new Date().toISOString();
  const inserted = await supabase
    .from("durable_ai_operations")
    .insert({
      user_id: userId,
      operation: input.operation,
      resource_id: input.resourceId ?? null,
      request_id: input.requestId,
      workflow_trace_id: input.workflowTraceId ?? null,
      status: "running",
      attempt_count: 1,
      started_at: now,
      finished_at: null,
      last_error_code: null,
      last_error_message: null,
      result_ref: {},
      updated_at: now,
    })
    .select("*")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return { state: "started", row: rowFrom(inserted.data) };
  }

  if (inserted.error?.code !== "23505") {
    throw inserted.error ?? new Error("Could not start durable AI operation.");
  }

  let existing = await readExisting(supabase, userId, input.operation, input.requestId);

  if (!existing && input.resourceId) {
    const running = await readRunningForResource(supabase, userId, input.operation, input.resourceId);
    if (running) {
      const runningDisposition = classifyExistingOperation(running);
      if (runningDisposition === "already_running") {
        return { state: "already_running", row: running };
      }

      const staleFinishedAt = new Date().toISOString();
      const { error: staleError } = await supabase
        .from("durable_ai_operations")
        .update({
          status: "failed",
          finished_at: staleFinishedAt,
          updated_at: staleFinishedAt,
          last_error_code: "stale_reclaimed",
          last_error_message: "A later request reclaimed this operation after its running lease expired.",
        })
        .eq("id", running.id)
        .eq("user_id", userId)
        .eq("status", "running")
        .eq("attempt_count", running.attempt_count);

      if (staleError) throw staleError;
      return beginDurableAiOperation(supabase, userId, input);
    }
  }

  if (!existing) {
    throw inserted.error ?? new Error("Durable AI operation conflict could not be resolved.");
  }

  const disposition = classifyExistingOperation(existing);

  if (disposition === "already_succeeded") {
    return { state: "already_succeeded", row: existing };
  }
  if (disposition === "already_running") {
    return { state: "already_running", row: existing };
  }

  /*
   * A failed operation, or one left "running" after its serverless invocation
   * disappeared, is reclaimable. attempt_count is the compare-and-swap guard:
   * two retries may both observe the stale row, but only one may increment the
   * attempt number that both read.
   */
  const reclaimed = await supabase
    .from("durable_ai_operations")
    .update({
      status: "running",
      attempt_count: existing.attempt_count + 1,
      started_at: now,
      finished_at: null,
      last_error_code: null,
      last_error_message: null,
      workflow_trace_id: input.workflowTraceId ?? existing.workflow_trace_id,
      updated_at: now,
    })
    .eq("id", existing.id)
    .eq("user_id", userId)
    .eq("attempt_count", existing.attempt_count)
    .select("*")
    .maybeSingle();

  if (reclaimed.error?.code === "23505" && input.resourceId) {
    const running = await readRunningForResource(supabase, userId, input.operation, input.resourceId);
    if (running) return { state: "already_running", row: running };
  }
  if (reclaimed.error) throw reclaimed.error;
  if (reclaimed.data) {
    return { state: "started", row: rowFrom(reclaimed.data) };
  }

  existing = await readExisting(supabase, userId, input.operation, input.requestId);
  if (!existing && input.resourceId) {
    existing = await readRunningForResource(supabase, userId, input.operation, input.resourceId);
  }
  if (!existing) throw new Error("Durable AI operation could not be recovered after a retry race.");
  const afterRace = classifyExistingOperation(existing);
  return {
    state: afterRace === "already_succeeded" ? "already_succeeded" : "already_running",
    row: existing,
  };
}

export async function succeedDurableAiOperation(
  supabase: SupabaseClient,
  userId: string,
  operationId: string,
  resultRef: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("durable_ai_operations")
    .update({
      status: "succeeded",
      result_ref: resultRef,
      finished_at: now,
      updated_at: now,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", operationId)
    .eq("user_id", userId);

  if (error) {
    console.warn("Could not mark durable AI operation succeeded", {
      operationId,
      code: error.code,
    });
  }
}

export async function failDurableAiOperation(
  supabase: SupabaseClient,
  userId: string,
  operationId: string,
  error: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : "Unknown operation failure.";
  const { error: updateError } = await supabase
    .from("durable_ai_operations")
    .update({
      status: "failed",
      finished_at: now,
      updated_at: now,
      last_error_code: error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : null,
      last_error_message: message.slice(0, 500),
    })
    .eq("id", operationId)
    .eq("user_id", userId);

  if (updateError) {
    console.warn("Could not mark durable AI operation failed", {
      operationId,
      code: updateError.code,
    });
  }
}
