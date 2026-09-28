/*
 * One door out to the email provider (Resend). Configuration-gated like every
 * other integration: with no key the caller is told, in words, rather than
 * the send silently doing nothing.
 */

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.SARTHO_EMAIL_FROM?.trim());
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: { unsubscribeUrl?: string | null } = {},
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SARTHO_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Email delivery is not configured.");

  /*
   * RFC 8058 one-click unsubscribe, so a mail client can offer its own
   * "unsubscribe" button and the recipient never has to trust a link in the
   * body. The same signed URL as the footer, posted rather than clicked.
   */
  const headers = options.unsubscribeUrl
    ? { "List-Unsubscribe": `<${options.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, ...(headers ? { headers } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string };
      if (typeof body?.message === "string") detail = body.message;
    } catch {
      // non-JSON body; the status alone still helps.
    }
    throw new Error(`Email provider returned ${response.status}${detail ? ` — ${detail}` : ""}.`);
  }
}
