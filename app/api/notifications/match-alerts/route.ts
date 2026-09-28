import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { APP_URL } from "@/lib/site";
import { runBriefSearch } from "@/lib/jobs/run-search";
import { deliverableAddress, ensureNotificationRow, recordTestSend } from "@/lib/notifications/address";
import { renderMatchAlertEmail, selectNewMatches } from "@/lib/notifications/match-alerts";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";
import { saveSwitch } from "@/lib/notifications/switch-route";
import { unsubscribeUrl } from "@/lib/notifications/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The match-alert switch. The address lives at /api/notifications/address. */
export async function PUT(request: Request) {
  return saveSwitch(request, "match_alerts_enabled");
}

const MIN_MINUTES_BETWEEN_TESTS = 10;

/**
 * Send a test alert now, from a live run of the brief, to the confirmed
 * address and nowhere else. This is how a person proves the whole chain —
 * brief, providers, scoring, delivery — without waiting for the schedule.
 * It used to take an address of its own, which made it a way to email
 * anybody a page of somebody's job matches.
 */
export async function POST() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json(
      { error: "Email delivery isn't connected yet. Add RESEND_API_KEY and SARTHO_EMAIL_FROM in the deployment settings.", code: "email_not_configured" },
      { status: 503 },
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Sartho cannot send a test right now." }, { status: 503 });
  }

  const ensured = await ensureNotificationRow(admin, { userId: user.id, accountEmail: user.email });
  if (!ensured.ok) {
    if (ensured.reason === "no_address") return NextResponse.json({ error: "Add an email address first.", code: "no_address" }, { status: 409 });
    return NextResponse.json({ error: "Sartho could not read your email settings." }, { status: 500 });
  }
  const to = deliverableAddress(ensured.address);
  if (!to) {
    return NextResponse.json(
      { error: "Confirm the address first. A test goes only to a confirmed address, like every other email.", code: "unverified" },
      { status: 409 },
    );
  }

  const lastTest = ensured.address.matchAlertsLastTestAt ? new Date(ensured.address.matchAlertsLastTestAt).getTime() : 0;
  if (Date.now() - lastTest < MIN_MINUTES_BETWEEN_TESTS * 60 * 1000) {
    return NextResponse.json(
      { error: `A test was sent in the last ${MIN_MINUTES_BETWEEN_TESTS} minutes — check your inbox and spam folder.`, code: "too_soon" },
      { status: 429 },
    );
  }

  const outcome = await runBriefSearch(supabase, user.id, { budgetMs: 35_000, maxResults: 40 });
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.code === "no_targets" ? 400 : 503 });
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const firstName = (profile?.full_name as string | null)?.split(/\s+/)[0] || "there";
  // A test shows what the brief finds right now, seen or not — that is the point.
  const matches = selectNewMatches(outcome.results, []);
  const optOut = unsubscribeUrl(APP_URL, user.id);
  const email = renderMatchAlertEmail({
    firstName,
    matches,
    criteria: outcome.criteria,
    appUrl: APP_URL,
    isTest: true,
    unsubscribeUrl: optOut,
  });

  try {
    await sendEmail(to, email.subject, email.html, { unsubscribeUrl: optOut });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Email delivery failed.", code: "email_failed" },
      { status: 502 },
    );
  }

  /* The test's own timestamp, never the schedule's. */
  await recordTestSend(admin, { userId: user.id, column: "match_alerts_last_test_at" });

  return NextResponse.json({ ok: true, matches: matches.length, criteria: outcome.criteria });
}
