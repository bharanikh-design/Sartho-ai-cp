import { confirmNotificationAddress } from "@/lib/notifications/address";
import { escapeHtml, linkPage } from "@/lib/notifications/link-page";
import { isWellFormedVerificationToken } from "@/lib/notifications/verification-token";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * The link in the confirmation email.
 *
 * Public on purpose: the person reading that inbox may have no Sartho
 * account, and the token in the link is the only credential. It can do one
 * thing, which is to say yes to the address it was sent to.
 *
 * Opening the link does not confirm anything. GET shows a page with one
 * button, and the button's POST is what confirms. Corporate mail filters
 * open every link in every email to check it, and a link that confirmed on
 * GET would let a scanner say yes on the recipient's behalf.
 */

export const runtime = "nodejs";

const FORM_PATH = "/api/notifications/verify";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!isWellFormedVerificationToken(token)) {
    return linkPage("That link is not valid", "The confirmation link is incomplete or was not issued by Sartho. Use the link from the most recent email.", { status: 400 });
  }
  const form = `<form method="post" action="${FORM_PATH}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit" style="padding:12px 18px;background:#155b45;color:white;border:0;border-radius:10px;font-size:16px;cursor:pointer">Yes, send Sartho email here</button></form><p style="color:#65756d;font-size:12px">If you didn't ask for this, close the page. Nothing is sent to this address unless you press the button.</p>`;
  return linkPage(
    "Confirm this address?",
    "A Sartho account asked to send its daily summary and match alerts to this address.",
    { extraHtml: form },
  );
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const raw = form?.get("token");
  const token = typeof raw === "string" ? raw : null;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return linkPage("Please try again", "Sartho could not confirm the address just now. The link stays valid, so try again in a few minutes.", { status: 503 });
  }

  const result = await confirmNotificationAddress(admin, token);
  if (result === "confirmed") {
    return linkPage(
      "Address confirmed",
      "Sartho can now send its daily summary and match alerts here, when they are switched on. Every email carries an unsubscribe link, so this can be stopped at any time without an account.",
    );
  }
  if (result === "expired") {
    return linkPage("That link has expired", "Confirmation links work for 24 hours. Whoever asked for this can send a new one from their Sartho email settings.", { status: 410 });
  }
  return linkPage("That link is not valid", "The confirmation link is incomplete, was already used, or was not issued by Sartho.", { status: 400 });
}
