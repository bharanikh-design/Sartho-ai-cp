import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCandidateWorkflowContext,
  type CandidateWorkflowContext,
} from "@/lib/context/candidate-workflow";
import { persistCandidateContextSnapshot } from "@/lib/data/candidate-context";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";

/**
 * The platform conductor for candidate-to-opportunity information flow.
 *
 * Feature modules do not get to independently reconstruct the candidate.
 * They receive one prepared workflow state whose Candidate Context is assembled
 * from Career Truth, Career Direction, Search Brief and Interaction Memory.
 */
export type CareerConductorState = {
  workflow: CandidateWorkflowContext;
  contextFingerprint: string;
};

export async function prepareCareerConductor(
  supabase: SupabaseClient,
  userId: string,
): Promise<CareerConductorState> {
  const workflow = await loadCandidateWorkflowContext(supabase, userId);
  const snapshot = await persistCandidateContextSnapshot(
    supabase,
    userId,
    workflow.candidateContext,
  );

  return {
    workflow,
    contextFingerprint: snapshot.fingerprint,
  };
}

/**
 * One authoritative quick opportunity evaluation.
 *
 * Search results, preview, saved jobs and rescoring all call this function.
 * The underlying deterministic matcher remains independently testable, but no
 * product workflow should assemble its inputs itself.
 */
export function evaluateOpportunity(
  state: Pick<CareerConductorState, "workflow">,
  title: string,
  description: string,
) {
  const { roles, evidence, lanes } = state.workflow.career;
  return scoreOpportunity(title, description, evidence, roles, lanes);
}
