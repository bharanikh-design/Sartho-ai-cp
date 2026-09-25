import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCandidateWorkflowContext } from "@/lib/context/candidate-workflow";
import {
  CANDIDATE_CONTEXT_SCHEMA_VERSION,
  type CandidateContext,
} from "@/lib/context/candidate-context";

function missingSnapshotTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return (error.message ?? "").toLowerCase().includes("candidate_context_snapshots");
}

function sourceFingerprint(context: CandidateContext): string {
  /*
   * generatedAt is deliberately excluded: two snapshots of identical source
   * truth should have the same fingerprint even when assembled at different
   * times.
   */
  const stable = JSON.stringify({
    schemaVersion: context.schemaVersion,
    careerTruth: context.careerTruth,
    explicitIntent: context.explicitIntent,
    learnedAffinity: context.learnedAffinity,
  });
  return createHash("sha256").update(stable).digest("hex");
}

export async function assembleCandidateContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<CandidateContext> {
  const { candidateContext } = await loadCandidateWorkflowContext(supabase, userId);
  return candidateContext;
}

/**
 * Persist a versioned, immutable context snapshot.
 *
 * V1 is intentionally append-only and does not drive ranking yet. A later
 * learning loop can compare snapshots, append behavioural affinity and audit
 * exactly which source changed the candidate model.
 */
export async function persistCandidateContextSnapshot(
  supabase: SupabaseClient,
  userId: string,
  context: CandidateContext,
): Promise<{ context: CandidateContext; fingerprint: string; inserted: boolean }> {
  const fingerprint = sourceFingerprint(context);

  const { data: existing, error: readError } = await supabase
    .from("candidate_context_snapshots")
    .select("id")
    .eq("user_id", userId)
    .eq("schema_version", CANDIDATE_CONTEXT_SCHEMA_VERSION)
    .eq("source_fingerprint", fingerprint)
    .maybeSingle();

  if (missingSnapshotTable(readError)) {
    console.warn("candidate_context_snapshots is not available yet; continuing with runtime provenance");
    return { context, fingerprint, inserted: false };
  }
  if (readError && readError.code !== "PGRST116") throw readError;
  if (existing) return { context, fingerprint, inserted: false };

  const { error } = await supabase.from("candidate_context_snapshots").insert({
    user_id: userId,
    schema_version: CANDIDATE_CONTEXT_SCHEMA_VERSION,
    source_fingerprint: fingerprint,
    context,
  });
  if (missingSnapshotTable(error)) {
    console.warn("candidate_context_snapshots is not available yet; continuing with runtime provenance");
    return { context, fingerprint, inserted: false };
  }
  if (error) throw error;

  return { context, fingerprint, inserted: true };
}

export async function snapshotCandidateContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ context: CandidateContext; fingerprint: string; inserted: boolean }> {
  const context = await assembleCandidateContext(supabase, userId);
  return persistCandidateContextSnapshot(supabase, userId, context);
}

export { sourceFingerprint };
