import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateOpportunity, prepareCareerConductor } from "@/lib/workflow/career-conductor";

/*
 * Keeping the canonical opportunity signal current after its inputs change.
 *
 * This used to be a second matcher: it called analyseJobDescription directly,
 * skipped title-fit construction, and therefore could rewrite a saved role with
 * a materially different answer from Search/Preview/Save. Rescoring now enters
 * through the same Career Conductor as every other opportunity evaluation.
 */

const RESCORABLE_STATUSES = new Set(["saved", "analysed", "approved"]);

export async function rescoreSavedJobs(
  supabase: SupabaseClient,
  userId: string,
  options: { invalidateDeepAnalysis?: boolean } = {},
): Promise<void> {
  try {
    const jobsResult = await supabase
      .from("jobs")
      .select("id,title,raw_description,status,rule_analysis")
      .eq("user_id", userId);

    const jobs = (jobsResult.data ?? []).filter((job) => RESCORABLE_STATUSES.has(job.status));
    if (!jobs.length) return;

    const conductor = await prepareCareerConductor(supabase, userId);
    const now = new Date().toISOString();

    if (options.invalidateDeepAnalysis) {
      const jobIds = jobs.map((job) => job.id);
      if (jobIds.length) {
        const { error: requirementsError } = await supabase
          .from("job_requirements")
          .delete()
          .in("job_id", jobIds);
        if (requirementsError) console.warn("Could not invalidate stale job requirements", requirementsError);

        const { error: analysisError } = await supabase
          .from("jobs")
          .update({
            deep_analysis_status: "not_started",
            deep_analysis_summary: null,
            deep_analysed_at: null,
          })
          .eq("user_id", userId)
          .in("id", jobIds);
        if (analysisError) console.warn("Could not mark stale deep analyses for refresh", analysisError);
      }
    }

    for (const job of jobs) {
      const scored = evaluateOpportunity(conductor, job.title, job.raw_description);

      const previous = job.rule_analysis as import("@/lib/types").RuleAnalysis | null;
      const ruleAnalysis = {
        ...scored.analysis,
        /*
         * Job meaning survives candidate changes. Candidate-specific semantic
         * fit does not: it was produced against an older Candidate Context and
         * must be re-established by Search/Preview/Save/Deep Analysis.
         */
        ...(previous?.semanticContext ? { semanticContext: previous.semanticContext } : {}),
      };

      await supabase
        .from("jobs")
        .update({
          recommendation: scored.recommendation,
          rule_analysis: ruleAnalysis,
          technical_heaviness: scored.evidenceBacking,
          overall_match: scored.overallMatch,
          updated_at: now,
        })
        .eq("id", job.id)
        .eq("user_id", userId);
    }
  } catch (caught) {
    // Context mutation is authoritative; a derived score refresh must not roll
    // back the user's Career Truth or Career Direction save.
    console.warn("Could not rescore saved opportunities", caught);
  }
}
