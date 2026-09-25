import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareerWorkspace } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { buildCandidateContext, type CandidateContext } from "@/lib/context/candidate-context";
import { deriveLearnedAffinity } from "@/lib/context/interaction-memory";
import { getCandidateInteractions } from "@/lib/data/interaction-memory";

export type CandidateWorkflowContext = {
  candidateContext: CandidateContext;
  career: Awaited<ReturnType<typeof getCareerWorkspace>>;
  search: Awaited<ReturnType<typeof getSearchPreferences>>;
};

export async function loadCandidateWorkflowContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<CandidateWorkflowContext> {
  /*
   * One orchestration read. Resume/evidence, Career Direction, Search Brief and
   * Interaction Memory meet here before any downstream component consumes them.
   * Callers receive both the canonical context and the raw records needed for
   * evidence-grounded scoring; they do not independently reinterpret intent.
   */
  const [career, search, interactions] = await Promise.all([
    getCareerWorkspace(supabase, userId),
    getSearchPreferences(supabase, userId),
    getCandidateInteractions(supabase, userId),
  ]);

  const learnedAffinity = deriveLearnedAffinity(interactions);
  const candidateContext = buildCandidateContext({
    ...career,
    search,
    learnedAffinity,
  });

  return { candidateContext, career, search };
}
