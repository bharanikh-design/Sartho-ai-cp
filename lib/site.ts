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
 * move together.
 */
export const AUTH_ORIGIN = PRODUCTION_APP_ORIGIN;

/** What Sartho is, in the words used for search results and shared links. */
export const SITE_NAME = "Sartho";
export const SITE_TAGLINE = "Your own headhunter. Finally.";
export const SITE_DESCRIPTION =
  "Sartho is an evidence-led AI career copilot for role matching, résumé tailoring, interview preparation and application tracking.";
