/*
 * Where to send somebody after sign-in, and only ever somewhere on this site.
 *
 * A prefix check ("starts with / but not //") is not enough: the URL parser
 * treats a backslash like a slash, so "/\\evil.example" resolves to
 * https://evil.example/ and the sign-in link becomes an open redirect. The
 * value is resolved the way the redirect will resolve it, and kept only if it
 * lands on this origin.
 */
export function safeNextPath(requested: string | null, origin: string): string {
  if (!requested || !requested.startsWith("/") || /^\/[\/\\]/.test(requested)) return "/";
  try {
    const resolved = new URL(requested, origin);
    if (resolved.origin !== origin) return "/";
    if (resolved.pathname.startsWith("/api/") || resolved.pathname.startsWith("/auth/")) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
