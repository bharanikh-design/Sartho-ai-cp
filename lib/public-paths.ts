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

/*
 * /privacy and /terms are public for two reasons. Somebody deciding whether to
 * sign up has to be able to read them before they do — a privacy policy behind
 * a login is a joke — and Google's OAuth brand verification fetches both, which
 * is what stops the sign-in screen naming a Supabase project reference instead
 * of Sartho.
 */
/*
 * "/" is public because a product needs a front door. Everything here used to
 * redirect a signed-out visitor to /login, so the homepage was a sign-in form
 * and nothing else — and Google's OAuth brand verification rejected it on
 * exactly that ground. The page itself decides what to render: the command
 * centre for somebody signed in, an explanation of the product for everybody
 * else.
 */
/*
 * The unsubscribe link is public because the person holding the email may
 * have no account at all; the signed token in the link is its only credential.
 */
export const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/extension", "/privacy", "/terms", "/contact", "/api/notifications/unsubscribe"] as const;

export function isPublicPath(pathname: string): boolean {
  /* A trailing slash is the same page. */
  const path = pathname.replace(/\/+$/, "") || "/";
  return (PUBLIC_PATHS as readonly string[]).includes(path);
}

/*
 * Routes that authenticate with something other than a session, and so must
 * not be asked for one.
 *
 * Vercel invokes a scheduled job with a bearer secret and no cookies. The
 * session guard answered every one of those invocations with 401 before the
 * route could read the secret, so neither scheduled email ever went out. An
 * uptime monitor hitting the health check sends nothing at all. Both kinds
 * of route check the caller themselves; the guard's job is to stay out of
 * the way. A trailing slash names a prefix; anything else is an exact path.
 */
export const SESSION_FREE_PATHS = ["/api/cron/", "/api/health"] as const;

export function isSessionFreePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return SESSION_FREE_PATHS.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
}
