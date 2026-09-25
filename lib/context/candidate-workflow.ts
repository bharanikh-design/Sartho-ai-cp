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


export type SearchIntentHandoff = {
  roles: string[];
  countries: string[];
  locations: string[];
  companies: string[];
  employmentTypes: string[];
  remotePreferences: string[];
  experienceLevel: string | null;
  directEmployersOnly: boolean | null;
  learnedAffinitySignals: number;
};

/**
 * The explicit contract between Candidate Context and Search.
 *
 * Search consumes user-declared intent through this handoff. Learned affinity is
 * counted so the downstream engine knows it exists, but it is not translated
 * into filters or ranking in this release.
 */
export function searchIntentFromCandidateContext(context: CandidateContext): SearchIntentHandoff {
  return {
    roles: context.explicitIntent.targetRoles.map((signal) => signal.value.name),
    countries: context.explicitIntent.countries.map((signal) => signal.value),
    locations: context.explicitIntent.locations.map((signal) => signal.value),
    companies: context.explicitIntent.companies.map((signal) => signal.value),
    employmentTypes: context.explicitIntent.employmentTypes.map((signal) => signal.value),
    remotePreferences: context.explicitIntent.remotePreferences.map((signal) => signal.value),
    experienceLevel: context.explicitIntent.experienceLevel?.value ?? null,
    directEmployersOnly: context.explicitIntent.directEmployersOnly?.value ?? null,
    learnedAffinitySignals: context.learnedAffinity.signals.length,
  };
}
