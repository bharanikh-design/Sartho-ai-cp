import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOperator } from "@/lib/operations/alerts";
import { isMissingTableError } from "@/lib/supabase/errors";

/*
 * The scheduled jobs, keeping a record of themselves.
 *
 * Every invocation opens a row when it starts and closes it when it ends,
 * with a status and the counts. From that one table three things become
 * possible that were not before: the health endpoint can say when each job
 * last succeeded, the diagnostics page can show it, and each job can notice
 * when the other one has gone quiet and tell the operator.
 *
 * Every write here is best effort. A job that cannot log its run must still
 * do its work; the log exists to catch silence, not to cause it.
 */

export type ScheduledJobName = "daily-digest" | "match-alerts";

export const SCHEDULED_JOB_NAMES: ScheduledJobName[] = ["daily-digest", "match-alerts"];

export const SCHEDULED_JOB_LABELS: Record<ScheduledJobName, string> = {
  "daily-digest": "Daily summary",
  "match-alerts": "Match alerts",
};

export type ScheduledRunStatus = "running" | "succeeded" | "failed";

export type ScheduledRunRecord = {
  id: string;
  job: ScheduledJobName;
  startedAt: string;
  finishedAt: string | null;
  status: ScheduledRunStatus;
  error: string | null;
};

/*
 * Both jobs run daily. Vercel's schedules can drift by hours, so a success
 * is only called stale once it is well over a day old, not a minute after
 * the schedule. A run still marked "running" after this long did not finish:
 * the function was cut off before it could close its own row.
 */
export const STALE_AFTER_HOURS = 30;
export const RUNNING_TIMEOUT_MINUTES = 20;

const TABLE = "scheduled_runs";
const MIGRATION_NOTE = "the scheduled_runs table is missing; run the 20260928120000_scheduled_runs migration";

export async function beginScheduledRun(admin: SupabaseClient, job: ScheduledJobName): Promise<string | null> {
  const { data, error } = await admin.from(TABLE).insert({ job, status: "running" }).select("id").single();
  if (error) {
    if (isMissingTableError(error, TABLE)) console.warn(`Scheduled run not recorded: ${MIGRATION_NOTE}`);
    else console.error("Unable to record the start of a scheduled run", { code: error.code });
    return null;
  }
  return (data as { id: string }).id;
}

export async function finishScheduledRun(
  admin: SupabaseClient,
  runId: string | null,
  outcome: { status: "succeeded" | "failed"; summary?: Record<string, number | string>; error?: string | null },
): Promise<void> {
  if (!runId) return;
  const { error } = await admin
    .from(TABLE)
    .update({
      status: outcome.status,
      finished_at: new Date().toISOString(),
      summary: outcome.summary ?? {},
      /* Words only, and not many of them. Never a token, an address or a key. */
      error: outcome.error ? outcome.error.slice(0, 500) : null,
    })
    .eq("id", runId);
  if (error) console.error("Unable to record the end of a scheduled run", { code: error.code });
}

export type ScheduledRunLog =
  | { ok: true; runs: ScheduledRunRecord[] }
  | { ok: false; reason: "missing_table" | "unavailable"; code: string | null };

export async function recentScheduledRuns(admin: SupabaseClient, limit = 40): Promise<ScheduledRunLog> {
  const { data, error } = await admin
    .from(TABLE)
    .select("id,job,started_at,finished_at,status,error")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error, TABLE)) return { ok: false, reason: "missing_table", code: error.code ?? null };
    console.error("Unable to read the scheduled run log", { code: error.code });
    return { ok: false, reason: "unavailable", code: error.code ?? null };
  }
  const runs = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => (SCHEDULED_JOB_NAMES as string[]).includes(String(row.job)))
    .map((row) => ({
      id: String(row.id),
      job: row.job as ScheduledJobName,
      startedAt: String(row.started_at),
      finishedAt: row.finished_at ? String(row.finished_at) : null,
      status: row.status as ScheduledRunStatus,
      error: typeof row.error === "string" ? row.error : null,
    }));
  return { ok: true, runs };
}

export type ScheduledJobState = "never" | "healthy" | "failing" | "stale";

export type ScheduledJobHealth = {
  job: ScheduledJobName;
  label: string;
  state: ScheduledJobState;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: ScheduledRunStatus | null;
  /** Written for the person reading it, with the next step where there is one. */
  message: string;
};

function hoursBetween(from: string, to: Date): number {
  return (to.getTime() - new Date(from).getTime()) / (60 * 60 * 1000);
}

function describeGap(hours: number): string {
  if (hours < 1) return "less than an hour";
  if (hours < 48) {
    const whole = Math.round(hours);
    return `${whole} hour${whole === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/*
 * One job's verdict from its rows. Pure, so the thresholds can be tested
 * without a database: the rows come in, the state comes out.
 */
export function scheduledJobHealth(job: ScheduledJobName, runs: ScheduledRunRecord[], now = new Date()): ScheduledJobHealth {
  const label = SCHEDULED_JOB_LABELS[job];
  const own = runs
    .filter((run) => run.job === job)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  if (!own.length) {
    return {
      job, label, state: "never", lastRunAt: null, lastSuccessAt: null, lastStatus: null,
      message: `${label} has never run on this deployment. The schedule is in vercel.json; if it is deployed, the request is not reaching the route.`,
    };
  }

  const last = own[0];
  const lastSuccess = own.find((run) => run.status === "succeeded") ?? null;
  const lastStatus: ScheduledRunStatus =
    last.status === "running" && hoursBetween(last.startedAt, now) * 60 > RUNNING_TIMEOUT_MINUTES ? "failed" : last.status;
  const base = { job, label, lastRunAt: last.startedAt, lastSuccessAt: lastSuccess?.startedAt ?? null, lastStatus };

  if (lastStatus === "failed") {
    const why = last.status === "running" ? "it was cut off before it finished" : (last.error ?? "no reason was recorded");
    const history = lastSuccess ? ` It last succeeded ${describeGap(hoursBetween(lastSuccess.startedAt, now))} ago.` : " It has never succeeded.";
    return { ...base, state: "failing", message: `The last ${label.toLowerCase()} run failed: ${why}.${history}` };
  }

  if (!lastSuccess) {
    return { ...base, state: "never", message: `${label} is running for the first time and has not finished yet.` };
  }

  const hours = hoursBetween(lastSuccess.startedAt, now);
  if (hours > STALE_AFTER_HOURS) {
    return {
      ...base, state: "stale",
      message: `${label} last succeeded ${describeGap(hours)} ago. It should run daily, so the schedule has stopped reaching it.`,
    };
  }

  return { ...base, state: "healthy", message: `${label} last succeeded ${describeGap(hours)} ago. The schedule is running.` };
}

export function scheduledJobsHealth(runs: ScheduledRunRecord[], now = new Date()): ScheduledJobHealth[] {
  return SCHEDULED_JOB_NAMES.map((job) => scheduledJobHealth(job, runs, now));
}

/*
 * What a finished run tells the operator.
 *
 * Its own partial failures, and the other job's silence. The second is the
 * one that matters: a job that never runs cannot report itself, but the job
 * that did run can see its absence in the log. With both jobs daily, a
 * broken one is reported within a day by the other, for as long as at least
 * one of them is alive.
 */
export async function reportScheduledRun(
  admin: SupabaseClient,
  job: ScheduledJobName,
  summary: { failed: number; details?: string[] },
): Promise<void> {
  try {
    if (summary.failed > 0) {
      await notifyOperator({
        subject: `${SCHEDULED_JOB_LABELS[job]}: ${summary.failed} ${summary.failed === 1 ? "delivery" : "deliveries"} failed`,
        lines: [
          `The ${SCHEDULED_JOB_LABELS[job].toLowerCase()} run finished, but ${summary.failed} of its deliveries failed.`,
          ...(summary.details?.slice(0, 10) ?? []),
          "The full counts are in the run log on the diagnostics page.",
        ],
      });
    }

    const log = await recentScheduledRuns(admin);
    if (!log.ok) return;
    for (const other of SCHEDULED_JOB_NAMES) {
      if (other === job) continue;
      const health = scheduledJobHealth(other, log.runs);
      if (health.state === "healthy") continue;
      await notifyOperator({
        subject: `${health.label} is not running`,
        lines: [health.message, "The same verdict is published at /api/health, and the run log is on the diagnostics page."],
      });
    }
  } catch (caught) {
    /* Reporting must never fail the run that did the work. */
    console.error("Unable to report on a scheduled run", { message: caught instanceof Error ? caught.message : "unknown" });
  }
}
