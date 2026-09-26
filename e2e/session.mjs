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
export const APP_URL = process.env.E2E_APP_URL ?? "http://127.0.0.1:3100";

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
