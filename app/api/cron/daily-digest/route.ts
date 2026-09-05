import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_CONFIG } from "@/lib/config/site";

import { buildDailyDigest, renderDigestEmail, type DigestJob } from "@/lib/notifications/digest";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    .eq("daily_digest_enabled", true);
  if (error) {
    console.error("Unable to load daily digest preferences", { code: error.code });
    return NextResponse.json({ error: "Unable to prepare daily digests." }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const preference of preferences ?? []) {
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
      const origin = process.env.NEXT_PUBLIC_APP_URL || SITE_CONFIG.defaultAppUrl;
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

  return NextResponse.json({ sent, failed });
}
