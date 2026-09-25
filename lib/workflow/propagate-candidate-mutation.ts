import type { SupabaseClient } from "@supabase/supabase-js";
import { rescoreSavedJobs } from "@/lib/matching/rescore";
import { prepareCareerConductor } from "@/lib/workflow/career-conductor";

export type CandidateMutationKind =
  | "career_truth"
  | "career_direction"
  | "search_brief";

/**
 * One declared propagation policy for changes to candidate-owned source state.
 *
 * Routes persist their own authoritative mutation first, then call this.
 * Derived work is deliberately best-effort: a stale score must never roll back
 * the user's Career Truth, Direction or Search Brief.
 */
export async function propagateCandidateMutation(
  supabase: SupabaseClient,
  userId: string,
  kind: CandidateMutationKind,
): Promise<void> {
  try {
    switch (kind) {
      case "career_truth":
        // Evidence changed: quick scores and requirement mappings are stale.
        await rescoreSavedJobs(supabase, userId, { invalidateDeepAnalysis: true });
        return;

      case "career_direction":
        // Intent changed: opportunity ordering/fit changes, evidence mappings do not.
        await rescoreSavedJobs(supabase, userId);
        return;

      case "search_brief":
        // Search constraints do not change a saved opportunity score, but the
        // canonical Candidate Context snapshot must advance immediately.
        await prepareCareerConductor(supabase, userId);
        return;
    }
  } catch (caught) {
    console.warn("Candidate mutation propagation did not complete", { kind, error: caught });
  }
}
