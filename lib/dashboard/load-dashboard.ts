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
  /**
   * The previous visit's last heartbeat.
   *
   * Read here, on the server, while the page renders — the browser heartbeat
   * has not run yet, so this row still holds the visit before this one. That
   * is what lets the daily brief say "since yesterday" honestly instead of
   * announcing the same roles as new on every reload.
   */
  lastSeenAt: string | null;
  /** The stored search, for "how many roles are waiting" and when they landed. */
  search: { count: number; searchedAt: string | null } | null;
}> {
  const [journeyResult, jobsLoad, applicationsLoad, activityLoad, searchLoad] = await Promise.all([
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
    /*
     * Both of these are decorative in the strict sense: the dashboard is
     * perfectly usable without either, so neither is allowed to fail the page.
     * A missing row, a dropped connection or a table that is not there yet
     * resolves to null and the brief simply says less.
     */
    /*
     * Wrapped in try/catch inside an async function rather than chained with
     * `.catch`: a client that throws synchronously from `.from()` — a table
     * that is not there, a misconfigured client — throws before any promise
     * exists, and a trailing `.catch` never sees it. That would take the whole
     * dashboard down for the sake of a greeting.
     */
    (async (): Promise<string | null> => {
      try {
        const { data } = await supabase
          .from("user_activity").select("last_seen_at").eq("user_id", userId).maybeSingle();
        return typeof data?.last_seen_at === "string" ? data.last_seen_at : null;
      } catch {
        return null;
      }
    })(),
    (async (): Promise<{ count: number; searchedAt: string | null } | null> => {
      try {
        const { data } = await supabase
          .from("search_results").select("results,searched_at").eq("user_id", userId).maybeSingle();
        if (!data || !Array.isArray(data.results)) return null;
        return {
          count: data.results.length,
          searchedAt: typeof data.searched_at === "string" ? data.searched_at : null,
        };
      } catch {
        return null;
      }
    })(),
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
    lastSeenAt: activityLoad,
    search: searchLoad,
  };
}
