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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Applicant tracking systems: the employer's own front door, hosted elsewhere.
 *
 * A Greenhouse or Workday link is not a third party standing between somebody
 * and an employer — it is that employer's hiring pipeline under a vendor's
 * domain. Applying there is applying to them directly, which is why these are
 * kept by "Direct employers only" while a job board is not.
 */
export const APPLICANT_TRACKING_HOSTS = [
  "myworkdayjobs.com", "workday.com", "greenhouse.io", "lever.co",
  "smartrecruiters.com", "workable.com", "ashbyhq.com", "bamboohr.com",
  "icims.com", "taleo.net", "successfactors.", "oraclecloud.com",
  "eightfold.ai", "jobvite.com", "recruitee.com", "teamtailor.com",
  "personio.", "breezy.hr", "rippling.com", "phenompeople.com", "avature.net",
];

/**
 * Job boards and aggregators: somebody else's listing of an employer's role.
 *
 * Real places to apply, and the default keeps every one of them. They are
 * separated out because "Direct employers only" needs to mean something, and
 * the one honest distinction available is whether the destination belongs to
 * the employer or to a marketplace reposting them.
 */
export const AGGREGATOR_BOARD_HOSTS = [
  "linkedin.com", "indeed.com", "seek.com", "glassdoor.", "ziprecruiter.com",
  "monster.com", "dice.com", "builtin.com", "wellfound.com", "totaljobs.com",
  "reed.co.uk", "efinancialcareers.", "naukri.com", "jobstreet.com", "jobsdb.com",
  "jora.com", "careerjet.", "jobleads.com", "bebee.com", "adzuna.",
  /*
   * Singapore and the wider APAC market, which this list did not cover.
   *
   * MyCareersFuture is the Singapore government's own job bank and Google for
   * Jobs routinely carries its listings — "via MyCareersFuture" sits in
   * apply_options beside LinkedIn. Unrecognised, it lost to Google's own
   * listing page, so a Singapore vacancy with a perfectly good government
   * apply link sent the person to a Google search instead. foundit (Monster's
   * rebrand across APAC) had the same problem, and "monster.com" did not
   * match "foundit.sg".
   */
  "mycareersfuture.gov.sg", "mycareersfuture.sg", "foundit.", "monsterapac.",
  "jobsbank.gov.sg", "techinasia.com", "glints.com", "nodeflair.com",
];

/**
 * Every destination host Sartho recognises, for ranking rather than filtering.
 *
 * `chooseApplyUrl` wants one list: a recognised destination of either kind
 * beats an unrecognised one, and it does not care which kind. Kept as the
 * concatenation so there is exactly one place a host is written down — the
 * two halves drifting apart is how a rule declared here ends up assumed
 * somewhere else.
 */
export const KNOWN_DESTINATION_HOSTS = [...AGGREGATOR_BOARD_HOSTS, ...APPLICANT_TRACKING_HOSTS];

/** A destination that belongs to a marketplace rather than to the employer. */
export function isAggregatorBoard(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return AGGREGATOR_BOARD_HOSTS.some((known) => host.includes(known));
}

/**
 * Whether this destination is the named employer's own domain.
 *
 * The same comparison `chooseApplyUrl` uses to prefer an employer's careers
 * page: both sides stripped to letters and digits, so "Acme Corp." matches
 * "careers.acmecorp.com". Three characters minimum, because a two-letter
 * company name is a substring of half the web.
 */
export function employerOwnsHost(url: string, employer: string | null | undefined): boolean {
  const name = (employer ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (name.length < 3) return false;
  return hostOf(url).replace(/[^a-z0-9]+/g, "").includes(name);
}

/**
 * Whether applying here means applying to the employer.
 *
 * Deliberately lenient, and the leniency is the safety property. It hides
 * only hosts recognised as marketplaces; an unfamiliar domain is kept,
 * because the overwhelmingly likely explanation for one is the employer's own
 * careers site under a name that does not string-match the company. Failing
 * the other way — hide unless recognised — would silently bury exactly the
 * direct employers this setting exists to surface, and the person would never
 * learn what they had lost.
 *
 * The employer check runs first so a marketplace hiring for itself still
 * counts: LinkedIn's own vacancies live on linkedin.com, and they are as
 * direct as any other employer's.
 */
export function isDirectEmployerDestination(url: string, employer: string | null | undefined): boolean {
  if (employerOwnsHost(url, employer)) return true;
  return !isAggregatorBoard(url);
}
