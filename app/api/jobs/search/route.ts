import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { runBriefSearch } from "@/lib/jobs/run-search";
import { loadCandidateWorkflowContext } from "@/lib/context/candidate-workflow";
import { persistCandidateContextSnapshot } from "@/lib/data/candidate-context";

export const runtime = "nodejs";
export const maxDuration = 120;

/*
 * "Search now": run the person's saved brief through the shared search engine
 * and return the ranked, scored results. Nothing is saved here — the person
 * still chooses what enters the pipeline. With no provider configured this
 * returns a clear 503 rather than inventing results.
 */
const STATUS: Record<string, number> = {
  not_configured: 503,
  country_unsupported: 503,
  no_targets: 400,
  provider_error: 502,
};

export async function POST() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const budgetMs = process.env.SEARCH_BUDGET_MS ? Number(process.env.SEARCH_BUDGET_MS) : undefined;

    /*
     * One handoff for the whole search: assemble the candidate workflow once,
     * persist the exact context being used, then execute search against that
     * same object. This prevents Candidate Context and Search from drifting into
     * two independent interpretations of the person.
     */
    const workflow = await loadCandidateWorkflowContext(supabase, user.id);
    const snapshot = await persistCandidateContextSnapshot(
      supabase,
      user.id,
      workflow.candidateContext,
    );

    const outcome = await runBriefSearch(supabase, user.id, {
      budgetMs,
      workflow,
      contextFingerprint: snapshot.fingerprint,
    });
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: STATUS[outcome.code] ?? 500 });
    }
    return NextResponse.json({ results: outcome.results, count: outcome.results.length, criteria: outcome.criteria });
  } catch (caught) {
    console.error("POST /api/jobs/search failed:", caught);
    const message = caught instanceof Error ? caught.message : "Search failed unexpectedly.";
    return NextResponse.json({ error: message, code: "server_error" }, { status: 500 });
  }
}
