import { NextResponse } from "next/server";
import { isJobSearchConfigured } from "@/lib/jobs/search-provider";
import { isEmailDeliveryConfigured } from "@/lib/notifications/send-email";
import { recentScheduledRuns, scheduledJobsHealth, type ScheduledJobHealth } from "@/lib/operations/scheduled-runs";
import { secretCipherStatus } from "@/lib/security/secret-cipher";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Is this deployment healthy? Answered for a machine.
 *
 * Point an uptime monitor at this and it will page somebody when the
 * database cannot be reached or a scheduled job has gone quiet. That is the
 * gap this closes: the scheduled emails failed on every run for weeks and
 * nothing anywhere said so, because nothing was looking.
 *
 * Public, because a monitor has no session. It reports states, never data:
 * no addresses, no counts of people, no configuration values, nothing about
 * any account. A 200 means healthy; a 503 means something needs a person,
 * and the body says what.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A monitor may poll every few seconds; the answer does not change that fast. */
const MEMO_MS = 15_000;
let memo: { at: number; status: number; body: HealthReport } | null = null;

type HealthReport = {
  status: "ok" | "degraded";
  checkedAt: string;
  commit: string | null;
  checks: {
    database: { ok: boolean; detail: string };
    email: { configured: boolean };
    jobSearch: { configured: boolean };
    /*
     * Whether the Drive integration can store a grant. The key itself is
     * write-only everywhere, so this is the only place its shape can be
     * confirmed from outside: `problem` names a malformed key, in fixed words.
     */
    integrations: { driveTokenKey: { configured: boolean; problem: string | null } };
    scheduledJobs:
      | { available: true; jobs: Array<Pick<ScheduledJobHealth, "job" | "label" | "state" | "lastRunAt" | "lastSuccessAt" | "message">> }
      | { available: false; detail: string };
  };
};

async function inspect(): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 7) || null;

  let database: HealthReport["checks"]["database"];
  let scheduledJobs: HealthReport["checks"]["scheduledJobs"];

  try {
    const log = await recentScheduledRuns(createAdminClient());
    if (log.ok) {
      database = { ok: true, detail: "reachable" };
      scheduledJobs = {
        available: true,
        jobs: scheduledJobsHealth(log.runs).map(({ job, label, state, lastRunAt, lastSuccessAt, message }) => ({
          job, label, state, lastRunAt, lastSuccessAt, message,
        })),
      };
    } else if (log.reason === "missing_table") {
      database = { ok: true, detail: "reachable" };
      scheduledJobs = { available: false, detail: "The run log table is missing. Apply the 20260928120000_scheduled_runs migration." };
    } else {
      database = { ok: false, detail: "The database did not answer." };
      scheduledJobs = { available: false, detail: "Not checked: the database did not answer." };
    }
  } catch {
    /* No service-role key, or the client could not be built at all. */
    database = { ok: false, detail: "The server is not configured to reach the database." };
    scheduledJobs = { available: false, detail: "Not checked: the database is not configured." };
  }

  const jobsHealthy = scheduledJobs.available && scheduledJobs.jobs.every((job) => job.state === "healthy");
  const cipher = secretCipherStatus();

  return {
    status: database.ok && jobsHealthy ? "ok" : "degraded",
    checkedAt,
    commit,
    checks: {
      database,
      email: { configured: isEmailDeliveryConfigured() },
      jobSearch: { configured: isJobSearchConfigured() },
      /* Reported, not scored: a deployment without Drive is whole, not degraded. */
      integrations: { driveTokenKey: { configured: cipher.configured, problem: cipher.problem } },
      scheduledJobs,
    },
  };
}

export async function GET() {
  if (!memo || Date.now() - memo.at > MEMO_MS) {
    const body = await inspect();
    memo = { at: Date.now(), status: body.status === "ok" ? 200 : 503, body };
  }
  return NextResponse.json(memo.body, {
    status: memo.status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
