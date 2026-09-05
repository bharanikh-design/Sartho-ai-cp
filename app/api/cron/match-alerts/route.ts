import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_CONFIG } from "@/lib/config/site";
import { runBriefSearch } from "@/lib/jobs/run-search";
import { isJobSearchConfigured } from "@/lib/jobs/search-provider";
import { renderMatchAlertEmail, selectNewMatches } from "@/lib/notifications/match-alerts";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";

/*
 * Scheduled match alerts.
 *
 * For every person who opted in, run their saved search brief through the same
 * engine "Search now" uses, keep the strong matches they have never been shown,
 * and email them — or send nothing on a quiet day. Cost is bounded three ways:
 * a cap on people per run, a per-person search budget, and a wall-clock budget
 * for the whole run. People are taken oldest-run first, so a run that hits its
 * budget picks up where it left off next time instead of starving anyone.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const RUN_BUDGET_MS = 270_000;
const PER_USER_SEARCH_BUDGET_MS = 30_000;
const MIN_HOURS_BETWEEN_RUNS = 20;

function maxUsersPerRun(): number {
  const raw = Number(process.env.MATCH_ALERTS_MAX_USERS ?? "25");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 25;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json({ error: "Email delivery is not configured (RESEND_API_KEY, SARTHO_EMAIL_FROM)." }, { status: 503 });
  }
  if (!isJobSearchConfigured()) {
    return NextResponse.json({ error: "Jobs search is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: preferences, error } = await admin
    .from("notification_preferences")
    .select("user_id,email,match_alerts_last_run_at")
    .eq("match_alerts_enabled", true)
    .order("match_alerts_last_run_at", { ascending: true, nullsFirst: true })
    .limit(maxUsersPerRun());
  if (error) {
    console.error("Unable to load match alert preferences", { code: error.code });
    return NextResponse.json({ error: "Unable to prepare match alerts." }, { status: 500 });
  }

  const startedAt = Date.now();
  const origin = process.env.NEXT_PUBLIC_APP_URL || SITE_CONFIG.defaultAppUrl;
  const cutoff = Date.now() - MIN_HOURS_BETWEEN_RUNS * 60 * 60 * 1000;
  const summary = { processed: 0, emailed: 0, quiet: 0, failed: 0, deferred: 0, skipped: 0 };
  const failures: string[] = [];

  for (const preference of preferences ?? []) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) { summary.deferred += 1; continue; }
    if (preference.match_alerts_last_run_at && new Date(preference.match_alerts_last_run_at).getTime() > cutoff) {
      summary.skipped += 1;
      continue;
    }
    summary.processed += 1;
    const userId = preference.user_id as string;
    const ranAt = new Date().toISOString();

    try {
      const outcome = await runBriefSearch(admin, userId, { budgetMs: PER_USER_SEARCH_BUDGET_MS, maxResults: 40 });
      if (!outcome.ok) {
        // A brief that cannot run (no target roles, provider down) is not
        // retried in a loop; it is recorded and the person is picked up next run.
        failures.push(`${userId.slice(0, 8)}: ${outcome.code}`);
        summary.failed += 1;
        await admin.from("notification_preferences").update({ match_alerts_last_run_at: ranAt }).eq("user_id", userId);
        continue;
      }

      const { data: seenRows } = await admin.from("seen_job_matches").select("url").eq("user_id", userId);
      const seenUrls = (seenRows ?? []).map((row) => row.url as string);
      const matches = selectNewMatches(outcome.results, seenUrls);

      if (matches.length) {
        const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
        const firstName = (profile?.full_name as string | null)?.split(/\s+/)[0] || "there";
        const email = renderMatchAlertEmail({ firstName, matches, criteria: outcome.criteria, appUrl: origin });
        await sendEmail(preference.email as string, email.subject, email.html);
        // Recorded after the send: a failed send leaves the matches for next
        // time rather than marking them as delivered.
        await admin.from("seen_job_matches").upsert(
          matches.map((match) => ({
            user_id: userId,
            url: match.url,
            title: match.title,
            employer: match.employer,
            location: match.location,
            overall_match: match.overallMatch,
            recommendation: match.recommendation,
            source: match.source,
            emailed_at: ranAt,
          })),
          { onConflict: "user_id,url" },
        );
        summary.emailed += 1;
      } else {
        summary.quiet += 1;
      }

      await admin.from("notification_preferences").update({ match_alerts_last_run_at: ranAt }).eq("user_id", userId);
    } catch (caught) {
      summary.failed += 1;
      failures.push(`${userId.slice(0, 8)}: ${caught instanceof Error ? caught.message : "unknown"}`);
      console.error("Match alert failed", { user: userId, message: caught instanceof Error ? caught.message : "unknown" });
    }
  }

  return NextResponse.json({ ...summary, failures, elapsedMs: Date.now() - startedAt });
}
