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

/** What Sartho is, in the words used for search results and shared links. */
export const SITE_NAME = "Sartho";
export const SITE_TAGLINE = "Your own headhunter. Finally.";
export const SITE_DESCRIPTION =
  "Sartho is an evidence-led AI career copilot for role matching, résumé tailoring, interview preparation and application tracking.";
