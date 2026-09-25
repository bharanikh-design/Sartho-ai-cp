import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCandidateWorkflowContext } from "@/lib/context/candidate-workflow";
import {
  buildCandidateContext,
  CANDIDATE_CONTEXT_SCHEMA_VERSION,
  type CandidateContext,
} from "@/lib/context/candidate-context";

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
export async function snapshotCandidateContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ context: CandidateContext; fingerprint: string; inserted: boolean }> {
  const context = await assembleCandidateContext(supabase, userId);
  const fingerprint = sourceFingerprint(context);

  const { data: existing, error: readError } = await supabase
    .from("candidate_context_snapshots")
    .select("id")
    .eq("user_id", userId)
    .eq("schema_version", CANDIDATE_CONTEXT_SCHEMA_VERSION)
    .eq("source_fingerprint", fingerprint)
    .maybeSingle();

  if (readError && readError.code !== "PGRST116") throw readError;
  if (existing) return { context, fingerprint, inserted: false };

  const { error } = await supabase.from("candidate_context_snapshots").insert({
    user_id: userId,
    schema_version: CANDIDATE_CONTEXT_SCHEMA_VERSION,
    source_fingerprint: fingerprint,
    context,
  });
  if (error) throw error;

  return { context, fingerprint, inserted: true };
}

export { sourceFingerprint };
