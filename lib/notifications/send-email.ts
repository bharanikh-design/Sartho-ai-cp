/*
 * One door out to the email provider (Resend). Configuration-gated like every
 * other integration: with no key the caller is told, in words, rather than
 * the send silently doing nothing.
 */

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.SARTHO_EMAIL_FROM?.trim());
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SARTHO_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
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
