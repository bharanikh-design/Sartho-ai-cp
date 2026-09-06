import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { APP_URL } from "@/lib/site";
import { buildDailyDigest, renderDigestEmail, type DigestJob } from "@/lib/notifications/digest";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";

/*
 * Send the daily summary now, so delivery can be proved in ten seconds rather
 * than by waiting until midnight and watching an inbox.
 *
 * Match alerts have had this since they shipped. The digest did not, which
 * meant the only way to discover that the scheduled run had been returning 401
 * for a month was to notice the absence of an email — and an email that does
 * not arrive is indistinguishable from a quiet day.
 *
 * The one subtlety is which timestamp this writes. A test must not touch
 * last_sent_at: the scheduled run reads that column to decide who is due, so
 * recording a test there would make the next real digest skip this person for
 * twenty hours. Proving the feature works would switch it off.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const testSchema = z.object({ email: z.string().trim().email().max(320) });

/* Enough to stop a double-click becoming two emails, short enough to retry. */
const MIN_MINUTES_BETWEEN_TESTS = 5;

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  /*
   * Named in the message on purpose. This is the failure an operator can fix,
   * and "something went wrong" would send them looking in the wrong place.
   */
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
    .select("daily_digest_last_test_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const lastTest = existing?.daily_digest_last_test_at ? new Date(existing.daily_digest_last_test_at).getTime() : 0;
  if (Date.now() - lastTest < MIN_MINUTES_BETWEEN_TESTS * 60 * 1000) {
    return NextResponse.json(
      { error: `A test was sent in the last ${MIN_MINUTES_BETWEEN_TESTS} minutes — check your inbox and your spam folder.`, code: "too_soon" },
      { status: 429 },
    );
  }

  const [{ data: jobs, error: jobsError }, { data: profile }] = await Promise.all([
    supabase.from("jobs").select("title,employer,status,recommendation,created_at,updated_at").eq("user_id", user.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (jobsError) {
    console.error("Unable to read jobs for a test digest", { code: jobsError.code });
    return NextResponse.json({ error: "Sartho could not read your pipeline." }, { status: 500 });
  }

  /*
   * The same twenty-four hours the scheduled run would cover, so the test is a
   * rehearsal of the real email rather than a different one that happens to
   * arrive. A quiet day therefore produces a quiet digest — which is itself
   * worth seeing, because it is what the schedule would have sent.
   */
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const digest = buildDailyDigest((jobs ?? []) as DigestJob[], since);
  const firstName = (profile?.full_name as string | null)?.split(/\s+/)[0] || "there";
  const email = renderDigestEmail(firstName, digest, APP_URL);

  try {
    await sendEmail(parsed.data.email, `${email.subject} (test)`, email.html);
  } catch (caught) {
    /*
     * The provider's own words. "Domain not verified" and "invalid key" are
     * different jobs, and collapsing them into one message is how an afternoon
     * gets spent on the wrong one.
     */
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Email delivery failed.", code: "email_failed" },
      { status: 502 },
    );
  }

  await supabase.from("notification_preferences").upsert({
    user_id: user.id,
    email: parsed.data.email,
    daily_digest_last_test_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    newMatches: digest.newMatches.length,
    strongMatches: digest.strongMatches.length,
  });
}
