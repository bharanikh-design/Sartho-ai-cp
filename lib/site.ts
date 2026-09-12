/*
 * The canonical public origin, in one place.
 *
 * Open Graph images and canonical links have to be absolute URLs, and robots
 * rules describe the same origin. Declaring it twice invites the pair to drift,
 * and a stale Open Graph host fails invisibly — the tags still render, they just
 * point somewhere that no longer serves the image.
 *
 * The env var exists so a preview or a renamed domain can override it without a
 * code change; the fallback is the domain actually serving production today.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://www.sartho.tech";

/*
 * The origin Sartho sends people back to: Supabase auth redirects, and the
 * links inside every email.
 *
 * It lived in a second module, lib/config/site.ts, holding a single key called
 * defaultAppUrl. That module is gone and its value is unchanged here, because
 * these two constants do not currently agree — SITE_URL falls back to the www
 * host and this one to the apex — and they are reachable from different places:
 * SITE_URL is read by Open Graph and canonical tags, APP_URL by the password
 * reset redirect (app/login/page.tsx) and the digest and match-alert emails.
 *
 * They are deliberately not merged into one value here. `redirectTo` has to be
 * an origin Supabase has been told to allow, and email links have to reach a
 * host that actually serves the app, so changing either one blind is how you
 * take out password reset without noticing. Sitting side by side, the
 * disagreement is at least visible, and the fix is a single line once the
 * canonical host is settled in DNS and in the Supabase redirect allow-list.
 */
const PRODUCTION_APP_ORIGIN = "https://sartho.tech";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || PRODUCTION_APP_ORIGIN;

/*
 * Where Supabase is allowed to send somebody back to, and nowhere else.
 *
 * Deliberately pinned rather than reading NEXT_PUBLIC_APP_URL, which is what
 * the login page already did before these constants were gathered here. A
 * redirectTo has to appear in Supabase's redirect allow-list or the request is
 * rejected, and a preview deployment sets NEXT_PUBLIC_APP_URL to its own
 * throwaway hostname — so honouring the env var here would break password
 * reset and OAuth on every preview, and quietly, at the point somebody is
 * locked out of their account.
 *
 * If the canonical host changes, this constant and the Supabase allow-list
 * move together. Other origins are not shut out — they are declared alongside
 * it in NEXT_PUBLIC_AUTH_ORIGINS below, which is a widening of the allow-list
 * rather than a replacement of this value, and anything undeclared is handed
 * off to this origin before a round trip starts rather than during one.
 */
export const AUTH_ORIGIN = PRODUCTION_APP_ORIGIN;

/** What Sartho is, in the words used for search results and shared links. */
export const SITE_NAME = "Sartho";
export const SITE_TAGLINE = "Your own headhunter. Finally.";
export const SITE_DESCRIPTION =
  "Sartho is an evidence-led AI career copilot for role matching, résumé tailoring, interview preparation and application tracking.";

/*
 * The origins that may finish a Supabase auth round trip by themselves.
 *
 * PKCE is why this list has to exist. `createBrowserClient` writes the code
 * verifier into a cookie on the origin the sign-in button was pressed on, and a
 * cookie set on one host is never sent to another — `www.sartho.tech` and
 * `sartho.tech` are different hosts to a browser, however alike they look. So a
 * flow that starts on one origin and comes back to another arrives at
 * /auth/callback with the authorization code and no verifier, and the exchange
 * fails with "PKCE code verifier not found in storage". Nothing about the
 * Google or Supabase configuration is wrong when that happens; the two legs
 * simply ran on different hosts.
 *
 * An origin belongs here only once it is also in the Supabase dashboard's
 * Redirect URLs list, which is the other half of the same agreement: Supabase
 * refuses a `redirectTo` it has not been shown and falls back to the project's
 * Site URL, which lands the round trip on the wrong host all over again.
 *
 * These three are the stable hosts that already serve the product and are
 * already in that dashboard list, so they are named here rather than left to a
 * deployment to remember. They are the ones a real visitor can arrive on: the
 * apex, the www host that SITE_URL advertises to search engines and shared
 * links, and the Vercel domain. Getting this wrong is not a degraded sign-in,
 * it is a locked door, so the default covers every door rather than the one
 * that happens to be canonical.
 *
 * Preview deployments are deliberately not wildcarded. A branch URL that is not
 * in the dashboard list would have its `redirectTo` refused and be bounced to
 * the Site URL, which is the failure this whole mechanism exists to prevent —
 * whereas an undeclared origin simply hands off to the apex and works. Add a
 * preview to both lists, or to neither.
 */
const DEFAULT_AUTH_ORIGINS = [PRODUCTION_APP_ORIGIN, "https://www.sartho.tech", "https://sartho.vercel.app"];

/*
 * Anything else that belongs to a particular deployment: a preview branch, or a
 * local port during development.
 * NEXT_PUBLIC_AUTH_ORIGINS="http://localhost:3000,https://sartho-git-x.vercel.app"
 */
const CONFIGURED_AUTH_ORIGINS = (process.env.NEXT_PUBLIC_AUTH_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

/** Every origin allowed to host both legs of a sign-in, canonical one included. */
export const AUTH_ORIGINS = [...new Set([AUTH_ORIGIN, ...DEFAULT_AUTH_ORIGINS, ...CONFIGURED_AUTH_ORIGINS])];

export function isAllowedAuthOrigin(origin: string | null | undefined) {
  if (!origin) return false;
  return AUTH_ORIGINS.includes(origin.replace(/\/+$/, ""));
}

/*
 * Where this browser should start a sign-in from.
 *
 * Returning the current origin keeps both legs on one host, which is the whole
 * point. When the current origin is not one Supabase will redirect back to, the
 * answer is the canonical origin instead, and the caller has to move the
 * browser there before starting — starting here and finishing there is the
 * broken case, not the fix for it.
 */
export function resolveAuthOrigin(currentOrigin: string | null | undefined) {
  const origin = currentOrigin?.replace(/\/+$/, "") ?? "";
  return isAllowedAuthOrigin(origin) ? origin : AUTH_ORIGIN;
}
