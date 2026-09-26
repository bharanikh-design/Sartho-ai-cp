/*
 * How a signed-in session is forged for the browser.
 *
 * `@supabase/ssr` keeps the session in a cookie named from the project URL's
 * first hostname label — `sb-<label>-auth-token` — holding `base64-` followed
 * by the base64url of the session JSON. Writing that cookie is the whole trick:
 * `proxy.ts` then finds a session, `requireUser()` resolves it against the
 * mock's /auth/v1/user, and protected pages render their real server
 * components. Nothing in lib/, app/ or components/ is stubbed or patched.
 *
 * Deliberately imports nothing from @playwright/test: Playwright transforms
 * spec files with its own loader, so a helper that pulled the test runner in
 * through Node's ESM loader would create a second, unusable instance of it.
 */
import { buildSession } from "./mock-supabase.mjs";
import { TEST_USER } from "./seed.mjs";

export const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";

/*
 * `localhost`, not `127.0.0.1`. Next 16 refuses to serve /_next/static and the
 * HMR socket to an origin that is not in `allowedDevOrigins`, and the dev
 * server's own canonical host is localhost — so a suite driven at 127.0.0.1
 * gets a fully server-rendered page whose client bundle 403s, and every page
 * sits on "Securing your session…" forever. The alternative is adding
 * `allowedDevOrigins: ["127.0.0.1"]` to next.config.ts.
 */
export const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";

/* The exact formula supabase-js uses: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`. */
export const AUTH_COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

export function sessionCookieValue(user = TEST_USER) {
  return `base64-${Buffer.from(JSON.stringify(buildSession(user))).toString("base64url")}`;
}

/** The cookie Playwright's `context.addCookies` needs for a signed-in context. */
export function sessionCookie(user = TEST_USER) {
  return {
    name: AUTH_COOKIE_NAME,
    value: sessionCookieValue(user),
    url: APP_URL,
    httpOnly: false,
    sameSite: "Lax",
  };
}
