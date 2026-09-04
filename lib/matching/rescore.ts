import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareerWorkspace } from "@/lib/data/career";
import { analyseJobDescription } from "@/lib/matching/analyse-job";
import { buildSkillProfile } from "@/lib/matching/skill-profile";
import { alignToLanes, overallMatchScore, withLane } from "@/lib/matching/opportunity-score";

/*
 * Keeping the match honest after its inputs change.
 *
 * A role's recommendation is only as current as the evidence and direction it
 * was scored against. Approve a new claim or re-set your priorities and every
 * saved opportunity's score is silently out of date — the match was computed
 * once, at insert, and never looked at again.
 *
 * This recomputes it. It is pure keyword work over data already loaded for
 * other reasons: no model runs, no quota is spent, so it is safe to fan out
 * across every open opportunity. It is best-effort by design — a scoring
 * refresh must never fail the approval or the direction save that triggered it.
 */

// Only opportunities still in play. Once a role is applied to or closed, its
// stored match is a record of the decision, not a live signal to overwrite.
const RESCORABLE_STATUSES = new Set(["saved", "analysed", "approved"]);

export async function rescoreSavedJobs(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    // Cheapest thing first: if there is nothing to re-score, do not load the
    // whole career workspace. During onboarding there are no jobs yet, so the
    // approval and direction saves that call this stay a single query.
    const jobsResult = await supabase
      .from("jobs")
      .select("id,title,raw_description,status,deep_analysis_status")
      .eq("user_id", userId);

    const jobs = (jobsResult.data ?? []).filter((job) => RESCORABLE_STATUSES.has(job.status));
    if (!jobs.length) return;

    const { roles, evidence, lanes } = await getCareerWorkspace(supabase, userId);
    const profile = buildSkillProfile(evidence, roles);
    const now = new Date().toISOString();

    for (const job of jobs) {
      const analysis = analyseJobDescription(job.raw_description, profile);
      const alignment = alignToLanes(job.title, job.raw_description, lanes);

      const update: Record<string, unknown> = {
        recommendation: analysis.recommendation,
        rule_analysis: withLane(analysis, alignment),
        technical_heaviness: analysis.evidenceBacking,
        updated_at: now,
      };

      // The evidence-grounded deep score is the better number where it exists;
      // the keyword pass must not overwrite it.
      if (job.deep_analysis_status !== "complete") {
        update.overall_match = overallMatchScore(analysis, alignment);
      }

      await supabase.from("jobs").update(update).eq("id", job.id).eq("user_id", userId);
    }
  } catch (caught) {
    console.warn("Could not rescore saved opportunities", caught);
  }
}
