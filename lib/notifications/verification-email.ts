/*
 * The confirmation email.
 *
 * Sent to an address somebody typed in, which may not be theirs. So it says
 * only what the recipient needs to decide: a Sartho account asked to send its
 * alerts here, confirm if that is you, ignore it if not, and nothing is sent
 * unless you confirm. It carries no name and nothing from anybody's pipeline.
 */

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderVerificationEmail(input: { address: string; confirmUrl: string; expiresInHours: number }) {
  const subject = "Confirm this address for Sartho email alerts";
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17211d">
    <h1 style="font-size:22px">Is this your address?</h1>
    <p>Somebody signed in to Sartho asked to send its daily summary and match alerts to <strong>${escapeHtml(input.address)}</strong>.</p>
    <p>If that was you, confirm it:</p>
    <p><a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;padding:12px 18px;background:#155b45;color:white;text-decoration:none;border-radius:10px">Confirm this address</a></p>
    <p style="color:#65756d;font-size:12px">If it wasn't you, ignore this email. Nothing will be sent to this address unless it is confirmed, and this link stops working in ${input.expiresInHours} hours.</p>
    <p style="color:#65756d;font-size:12px">If the button does not work, open this link: ${escapeHtml(input.confirmUrl)}</p>
  </div>`;
  return { subject, html };
}
