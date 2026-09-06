import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/site";

import { buildDailyDigest, renderDigestEmail, type DigestJob } from "@/lib/notifications/digest";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";

export const runtime = "nodejs";
export const maxDuration = 120;

/*
 * Bounded the same three ways match alerts already is: a cap on people per
 * run, a wall-clock budget, and oldest-sent-first ordering.
 *
 * It had none of them. The loop ran over every opted-in person with a
 * 120-second function around it and no ordering at all, so past the point
 * where a run stopped fitting, the query's arbitrary order decided who got a
 * digest — and it would decide the same way tomorrow. The people at the front
 * would be served every day and the people behind them never, with the
 * response reporting a cheerful `sent` count and no sign that anybody had been
 * missed.
 *
 * Ordering by last_sent_at, nulls first, makes a truncated run self-correcting:
 * whoever waited longest is at the front of the next one, and somebody who has
 * never received a digest is ahead of everybody.
 *
 * The budget is well under maxDuration so the run reports its own shortfall
 * rather than being killed mid-send with no record of where it got to.
 */
const RUN_BUDGET_MS = 100_000;
const MIN_HOURS_BETWEEN_RUNS = 20;

function maxUsersPerRun(): number {
  const raw = Number(process.env.DAILY_DIGEST_MAX_USERS ?? "250");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 250;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: preferences, error } = await admin
    .from("notification_preferences")
    .select("user_id,email,last_sent_at")
    .eq("daily_digest_enabled", true)
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(maxUsersPerRun());
  if (error) {
    console.error("Unable to load daily digest preferences", { code: error.code });
    return NextResponse.json({ error: "Unable to prepare daily digests." }, { status: 500 });
  }

  const startedAt = Date.now();
  const cutoff = Date.now() - MIN_HOURS_BETWEEN_RUNS * 60 * 60 * 1000;
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  let skipped = 0;
  for (const preference of preferences ?? []) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) { deferred += 1; continue; }
    /*
     * Already served today. Without this, a re-triggered cron sends a second
     * digest covering the few minutes since the first — an email whose every
     * section is empty.
     */
    if (preference.last_sent_at && new Date(preference.last_sent_at).getTime() > cutoff) {
      skipped += 1;
      continue;
    }
    const since = preference.last_sent_at ? new Date(preference.last_sent_at) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ data: jobs, error: jobsError }, { data: profile }] = await Promise.all([
      admin.from("jobs").select("title,employer,status,recommendation,created_at,updated_at").eq("user_id", preference.user_id),
      admin.from("profiles").select("full_name").eq("id", preference.user_id).maybeSingle(),
    ]);
    if (jobsError) {
      failed += 1;
      continue;
    }

    try {
      const digest = buildDailyDigest((jobs ?? []) as DigestJob[], since);
      const origin = APP_URL;
      const firstName = profile?.full_name?.split(/\s+/)[0] || "there";
      const email = renderDigestEmail(firstName, digest, origin);
      await sendEmail(preference.email, email.subject, email.html);
      await admin.from("notification_preferences").update({ last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", preference.user_id);
      sent += 1;
    } catch (caught) {
      console.error("Daily digest delivery failed", { message: caught instanceof Error ? caught.message : "unknown" });
      failed += 1;
    }
  }

  return NextResponse.json({ sent, failed, skipped, deferred, elapsedMs: Date.now() - startedAt });
}
