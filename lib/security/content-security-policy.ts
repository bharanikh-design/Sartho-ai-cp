/*
 * The Content-Security-Policy, built per request.
 *
 * Script execution is allowed only for scripts carrying this request's nonce
 * and for scripts those scripts load ('strict-dynamic'). Next.js attaches the
 * nonce to every script it emits, including the inline ones that carry the
 * page's data, so nothing an attacker could inject into the page can run.
 * That is the whole point: React already escapes what it renders, and this
 * is the second lock in case something ever slips past it.
 *
 * Everything else is closed to the minimum the product needs:
 *
 *   connect-src  Supabase, over https and its websocket, and nothing else.
 *   frame-src    blob: for the résumé preview, which draws the PDF in the
 *                browser and shows it in an iframe under a blob URL.
 *   object-src   'self' and blob:, not 'none'. Chrome renders a PDF through
 *                its viewer plugin, and a blob document inherits this page's
 *                policy, so 'none' risks refusing the preview's own PDF.
 *                Plugin content from any other origin stays refused.
 *   script-src   'wasm-unsafe-eval' for the same preview: its layout engine
 *                is WebAssembly, and Chrome refuses to compile it without
 *                this. It permits WebAssembly only, never JavaScript eval.
 *   style-src    'unsafe-inline', because the product styles elements with
 *                inline style attributes throughout. A style injection
 *                cannot run code, which is why this one is acceptable and
 *                the script one is not.
 *
 * In development React reconstructs server stacks with eval, so
 * 'unsafe-eval' is allowed there and nowhere else. upgrade-insecure-requests
 * is only sent on https, so a local http server is not told to upgrade its
 * own requests into a wall.
 */

export type ContentSecurityPolicyInput = {
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL, or null when the deployment has none. */
  supabaseUrl: string | null;
  isDevelopment: boolean;
  /** Whether the page itself is served over https. */
  isSecure: boolean;
};

/* 128 bits of randomness, base64: unguessable, and fresh for every request. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function supabaseSources(supabaseUrl: string | null): string[] {
  if (!supabaseUrl) return [];
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const socket = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${socket}//${url.host}`];
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy(input: ContentSecurityPolicyInput): string {
  const scriptSources = ["'self'", `'nonce-${input.nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'"];
  if (input.isDevelopment) scriptSources.push("'unsafe-eval'");

  const connectSources = ["'self'", ...supabaseSources(input.supabaseUrl)];
  /* The dev server's hot-reload socket. */
  if (input.isDevelopment) connectSources.push("ws:", "wss:");

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (input.isSecure) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}
