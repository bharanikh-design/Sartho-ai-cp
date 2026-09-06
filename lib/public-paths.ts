/*
 * The pages that do not need a session, named once.
 *
 * They were named twice, and the two lists disagreed. The request proxy let
 * /extension through — it is the page you send somebody so they can install the
 * thing that sends roles into Sartho, and requiring an account to read it
 * defeats the point — while the app shell went on redirecting anybody without a
 * session to /login. The page was public in one layer and unreachable in the
 * next, which reads to a visitor as a broken link.
 *
 * Shared by both, so a path added here is public in both places or in neither.
 */

export const PUBLIC_PATHS = ["/login", "/auth/callback", "/extension"] as const;

export function isPublicPath(pathname: string): boolean {
  /* A trailing slash is the same page. */
  const path = pathname.replace(/\/+$/, "") || "/";
  return (PUBLIC_PATHS as readonly string[]).includes(path);
}
