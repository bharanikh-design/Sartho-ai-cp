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
export const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/extension", "/privacy", "/terms", "/contact"] as const;

export function isPublicPath(pathname: string): boolean {
  /* A trailing slash is the same page. */
  const path = pathname.replace(/\/+$/, "") || "/";
  return (PUBLIC_PATHS as readonly string[]).includes(path);
}
