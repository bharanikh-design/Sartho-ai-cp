import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProductJourney } from "@/lib/journey/load-product-journey";
import { withJwtClockSkewRetry } from "@/lib/supabase/retry";
import type {
  CommandCentreApplication,
  CommandCentreJob,
} from "@/lib/dashboard/command-centre";

export async function loadDashboardData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  journeyResult: Awaited<ReturnType<typeof loadProductJourney>>;
  jobs: CommandCentreJob[];
  applications: CommandCentreApplication[];
  unavailable: Array<"jobs" | "applications">;
}> {
  const [journeyResult, jobsLoad, applicationsLoad] = await Promise.all([
    loadProductJourney(supabase, userId),
    withJwtClockSkewRetry(
      () => supabase
        .from("jobs")
        .select("id,title,employer,status,recommendation,overall_match,rule_analysis,deep_analysis_status,deep_analysis_summary,updated_at")
        .eq("user_id", userId),
      (result) => result.error,
    )
      .then((result) => ({ ok: !result.error, data: result.data ?? [], error: result.error }))
      .catch((error) => ({ ok: false, data: [], error })),
    Promise.resolve(
      supabase
        .from("applications")
        .select("job_id,resume_draft,next_action,next_action_date")
        .eq("user_id", userId),
    )
      .then((result) => ({ ok: !result.error, data: result.data ?? [], error: result.error }))
      .catch((error) => ({ ok: false, data: [], error })),
  ]);

  const unavailable: Array<"jobs" | "applications"> = [];
  if (!jobsLoad.ok) {
    unavailable.push("jobs");
    console.warn("Dashboard jobs unavailable; showing core career state only", jobsLoad.error);
  }
  if (!applicationsLoad.ok) {
    unavailable.push("applications");
    console.warn("Dashboard applications unavailable; showing core career state only", applicationsLoad.error);
  }

  return {
    journeyResult,
    jobs: jobsLoad.data as CommandCentreJob[],
    applications: applicationsLoad.data as CommandCentreApplication[],
    unavailable,
  };
}
