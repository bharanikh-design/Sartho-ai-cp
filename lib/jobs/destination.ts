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
 * Normalising both sides through here is what makes a stored row and a fresh
 * result comparable at all: `URL.href` settles the trailing slash, the host
 * case and a default port, none of which the two sides are guaranteed to agree
 * on. Anything unparseable falls back to the trimmed original, so a row in some
 * older shape still compares equal to itself.
 *
 * It does NOT fold `http:` into `https:`, and that is a recent, deliberate
 * narrowing. It did, briefly: destinations became https-only, so legacy http
 * rows could never match and those vacancies would have been emailed twice.
 * Folding fixed that and introduced a quieter fault — a host serving different
 * content per scheme would have had a real alert silently suppressed, which is
 * the worse failure of the two even though it is far rarer.
 *
 * `20260927003000_canonical_seen_job_matches.sql` rewrote the stored rows to
 * https instead, so the data no longer needs the code to paper over it. That
 * migration and this function are only correct together: run the code without
 * the migration and every legacy http row re-alerts once.
 */
export function destinationKey(url: string | null | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).href;
  } catch {
    return trimmed;
  }
}
