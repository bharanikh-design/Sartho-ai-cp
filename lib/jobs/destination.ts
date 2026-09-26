/*
 * Where a job card sends somebody, written one way.
 *
 * Two questions get asked about an advert's URL and they are not the same, so
 * they get separate functions. Choosing a destination is strict — it decides
 * what a person clicks and what the save route will accept. Recognising one
 * again is lenient — it compares against URLs already stored, which were
 * written under older rules and must still match.
 *
 * Both live here because the last three bugs in this area came from the same
 * shape of mistake: the rule declared in one file and assumed in another.
 */

/**
 * A destination good enough to put in a card, canonicalised, or null.
 *
 * **https only.** `app/api/jobs/schema.ts` accepts `sourceUrl` only when it
 * starts with `https://`, so an http destination produces a card whose "Save
 * to pipeline" returns 400 every time. Ranking a plausible apply link above
 * Google's page made that reachable: an unrecognised http option now beats an
 * https `share_link` it used to lose to. A card you cannot save is worse than
 * one pointing at Google's listing, so the mapper is held to the same contract
 * the save route enforces rather than the two disagreeing.
 *
 * **Canonical, not merely valid.** `https:example.com/jobs/1` — no slashes —
 * parses with hostname "example.com", so a yes/no check passes it through
 * unchanged and the browser then resolves the raw string against the document
 * base. Because the scheme matches the page's, it is treated as relative:
 * `https://sartho.app/example.com/jobs/1`. Same origin, dead link, validated.
 * Returning `parsed.href` removes the ambiguity.
 *
 * The scheme test is an allowlist, so anything unanticipated fails closed.
 * `javascript:` and `data:` are why: both parse cleanly, both report an empty
 * hostname, and both execute from an href when somebody clicks.
 */
export function canonicalDestination(url: string | null | undefined): string | null {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * The identity of a destination, for asking "have we shown this before?".
 *
 * Deliberately lenient where `canonicalDestination` is strict. `seen_job_matches`
 * holds URLs written before any of this existed — http ones, uncanonicalised
 * ones — and `selectNewMatches` compares them to a fresh result as exact
 * strings. So the moment the mapper started returning `parsed.href`,
 * `https://example.com` became `https://example.com/` and stopped matching the
 * stored row: the same vacancy would be emailed a second time, against a
 * once-ever promise.
 *
 * Normalising both sides through here fixes that without migrating the table.
 * Anything unparseable falls back to the trimmed original, so a row in some
 * older shape still compares equal to itself.
 *
 * http and https collapse to one key, and that is the whole reason this is
 * separate from `canonicalDestination` rather than a flag on it. Destinations
 * are https-only now, so the mapper can never again emit the http form of a
 * vacancy — which means every legacy `http://` row would stay permanently
 * unmatched and every one of those vacancies would be emailed a second time.
 * Two URLs differing only in scheme are the same page, so treating them as one
 * identity costs nothing and is what keeps the once-ever promise across the
 * change.
 */
export function destinationKey(url: string | null | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    return parsed.href;
  } catch {
    return trimmed;
  }
}
