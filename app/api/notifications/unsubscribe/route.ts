import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * The link at the bottom of every Sartho email.
 *
 * Public on purpose: the person holding the message may not have an account,
 * or may not be the person who typed their address in. The token is the only
 * credential, and it can do one thing — switch both scheduled emails off for
 * the account it names. It cannot read anything, and it cannot switch them
 * back on.
 *
 * GET is the link a person clicks. POST is the one-click form that mail
 * clients send from the List-Unsubscribe header, which arrives with no
 * browser and no session.
 */

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Sartho</title></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;color:#17211d"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

async function unsubscribe(token: string | null): Promise<{ ok: true } | { ok: false; reason: "invalid" | "unavailable" }> {
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return { ok: false, reason: "invalid" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const { error } = await admin
    .from("notification_preferences")
    .update({ daily_digest_enabled: false, match_alerts_enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) {
    console.error("Unable to honour an unsubscribe link", { code: error.code });
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await unsubscribe(token);
  if (result.ok) {
    return page("You're unsubscribed", "Sartho will not send the daily summary or match alerts to this address again. Anyone with a Sartho account can turn them back on from their own settings.");
  }
  if (result.reason === "invalid") {
    return page("That link is not valid", "The unsubscribe link is incomplete or was not issued by Sartho. Use the link at the bottom of the most recent email.", 400);
  }
  return page("Please try again", "Sartho could not update the preference just now. The link stays valid, so try again in a few minutes.", 503);
}

/* RFC 8058 one-click: the mail client posts List-Unsubscribe=One-Click. */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await unsubscribe(token);
  if (result.ok) return new NextResponse(null, { status: 200 });
  return NextResponse.json({ error: result.reason === "invalid" ? "Invalid token." : "Try again later." }, { status: result.reason === "invalid" ? 400 : 503 });
}
