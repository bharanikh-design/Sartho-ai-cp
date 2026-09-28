import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";

/*
 * Telling the operator something broke.
 *
 * Both scheduled jobs failed for weeks with nothing to show for it: no error
 * in the product, no email, and an absent email is what a quiet day looks
 * like. Whatever a scheduled run learns about its own health, or the health
 * of the other job, goes here, and from here to a person.
 *
 * Addressed to SARTHO_ALERT_EMAIL through the same provider as every other
 * email. Without that address the alert goes to the server log, which is
 * better than nowhere and worse than an inbox, and the diagnostics page says
 * so.
 */

export function operatorAlertAddress(): string | null {
  const address = process.env.SARTHO_ALERT_EMAIL?.trim();
  return address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Sends an alert if it can, logs it if it cannot. Never throws: an alert
 * that fails must not take the run that raised it down with it.
 */
export async function notifyOperator(input: { subject: string; lines: string[] }): Promise<"emailed" | "logged"> {
  const address = operatorAlertAddress();
  const subject = `[Sartho] ${input.subject}`;

  if (!address || !isEmailDeliveryConfigured()) {
    console.warn("[operator-alert]", subject, input.lines.join(" | "));
    return "logged";
  }

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17211d"><h1 style="font-size:20px">${escapeHtml(input.subject)}</h1>${input.lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")}<p style="color:#65756d;font-size:12px">Sent to the operator address in SARTHO_ALERT_EMAIL. Scheduled jobs check each other every run, so this repeats daily until the cause is fixed.</p></div>`;

  try {
    await sendEmail(address, subject, html);
    return "emailed";
  } catch (caught) {
    console.error("[operator-alert] could not be emailed", { message: caught instanceof Error ? caught.message : "unknown" });
    console.warn("[operator-alert]", subject, input.lines.join(" | "));
    return "logged";
  }
}
