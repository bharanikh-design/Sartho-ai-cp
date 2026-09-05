import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { SITE_CONFIG } from "@/lib/config/site";
import { runBriefSearch } from "@/lib/jobs/run-search";
import { renderMatchAlertEmail, selectNewMatches } from "@/lib/notifications/match-alerts";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";

export const runtime = "nodejs";
export const maxDuration = 60;

const preferenceSchema = z.object({
  email: z.string().trim().email().max(320),
  enabled: z.boolean(),
});

/** Save the match-alert preference: the address and whether to send. */
export async function PUT(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: user.id,
    email: parsed.data.email,
    match_alerts_enabled: parsed.data.enabled,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Unable to save match alert preference", { code: error.code });
    return NextResponse.json({ error: "Sartho could not save your alert preference." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

const testSchema = z.object({ email: z.string().trim().email().max(320) });
const MIN_MINUTES_BETWEEN_TESTS = 10;

/**
 * Send a test alert now, to the given address, from a live run of the brief.
 * This is how a person confirms the whole chain — brief, providers, scoring,
 * email delivery — works, without waiting for the overnight schedule.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json(
      { error: "Email delivery isn't connected yet. Add RESEND_API_KEY and SARTHO_EMAIL_FROM in the deployment settings.", code: "email_not_configured" },
      { status: 503 },
    );
  }
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const { data: existing } = await supabase
    .from("notification_preferences")
    .select("match_alerts_last_test_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const lastTest = existing?.match_alerts_last_test_at ? new Date(existing.match_alerts_last_test_at).getTime() : 0;
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
  const email = renderMatchAlertEmail({
    firstName,
    matches,
    criteria: outcome.criteria,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || SITE_CONFIG.defaultAppUrl,
    isTest: true,
  });

  try {
    await sendEmail(parsed.data.email, email.subject, email.html);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Email delivery failed.", code: "email_failed" },
      { status: 502 },
    );
  }

  await supabase.from("notification_preferences").upsert({
    user_id: user.id,
    email: parsed.data.email,
    match_alerts_last_test_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, matches: matches.length, criteria: outcome.criteria });
}
