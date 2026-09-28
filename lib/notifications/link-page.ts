/*
 * The page behind a link in an email: one sentence of outcome, no shell and
 * no session. The unsubscribe link and the address-confirmation link both
 * land here, and whoever clicked may have no account at all.
 */

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** `body` is escaped; `extraHtml` is trusted markup the caller built itself. */
export function linkPage(title: string, body: string, options: { status?: number; extraHtml?: string } = {}): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Sartho</title></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;color:#17211d"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>${options.extraHtml ?? ""}</body></html>`;
  return new Response(html, {
    status: options.status ?? 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
