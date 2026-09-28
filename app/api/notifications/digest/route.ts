import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { APP_URL } from "@/lib/site";
import { deliverableAddress, ensureNotificationRow, recordTestSend } from "@/lib/notifications/address";
import { buildDailyDigest, renderDigestEmail, type DigestJob } from "@/lib/notifications/digest";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";
import { unsubscribeUrl } from "@/lib/notifications/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Send the daily summary now, so delivery can be proved in ten seconds rather
 * than by waiting until midnight and watching an inbox.
 *
 * It goes to the confirmed address and nowhere else. The test used to take an
 * address of its own, which made it a way to send a summary of somebody's
 * pipeline to any inbox on earth, and the scheduled run reads the same
 * address, so proving the feature works can never point it somewhere new.
 *
 * The one subtlety is which timestamp this writes. A test must not touch
 * last_sent_at: the scheduled run reads that column to decide who is due, so
 * recording a test there would make the next real digest skip this person for
 * twenty hours. Proving the feature works would switch it off.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

/* Enough to stop a double-click becoming two emails, short enough to retry. */
const MIN_MINUTES_BETWEEN_TESTS = 5;

export async function POST() {
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

  const lastTest = ensured.address.digestLastTestAt ? new Date(ensured.address.digestLastTestAt).getTime() : 0;
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
  const optOut = unsubscribeUrl(APP_URL, user.id);
  const email = renderDigestEmail(firstName, digest, APP_URL, optOut);

  try {
    await sendEmail(to, `${email.subject} (test)`, email.html, { unsubscribeUrl: optOut });
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

  /* The test's own timestamp, never the schedule's. */
  await recordTestSend(admin, { userId: user.id, column: "daily_digest_last_test_at" });

  return NextResponse.json({
    ok: true,
    newMatches: digest.newMatches.length,
    strongMatches: digest.strongMatches.length,
  });
}
