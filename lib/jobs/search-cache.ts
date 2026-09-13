/*
 * A shared memory of what Google for Jobs answered.
 *
 * SerpApi's free plan answers a query it has served before in about three
 * seconds and one it has not in more time than a search has to give. That made
 * the deep provider useless in practice: a measured search submitted three
 * queries, two never came back, and the whole page was carried by four-line
 * blurbs. Warming the queries by hand fixed it for about an hour — SerpApi's
 * own cache is short, and by the next morning every title was cold again.
 *
 * So Sartho keeps the answer instead of renting it.
 *
 * Three things follow, and the third is the reason this is worth a table.
 *
 *   - A submitted search is never wasted. Collecting a result from SerpApi's
 *     archive is free and does not count against the allowance, so a query
 *     that outran one search's budget is picked up by the next one for
 *     nothing. Two hundred and fifty searches a month stop being two hundred
 *     and fifty expiring answers and become two hundred and fifty kept ones.
 *
 *   - A stale answer still beats no answer. Adverts change over days, not
 *     minutes, so a day-old reading of "Engagement Manager in Singapore" is
 *     served immediately and refreshed behind the person rather than making
 *     them wait for a live one.
 *
 *   - The cache is not per person. "Engagement Manager, Singapore" returns the
 *     same adverts whoever asked, so one person's search warms that title for
 *     everybody. The rows are shared and hold nothing about who ran the query
 *     — which is both the privacy property and the compounding one.
 */

import type { JobSearchQuery } from "@/lib/jobs/search-provider";

/** Served without asking anybody. */
export const FRESH_MS = 6 * 60 * 60 * 1000;

/**
 * Served, and refreshed behind the person. Beyond this an advert has had long
 * enough to be filled or withdrawn that showing it is a claim Sartho cannot
 * stand behind.
 */
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long an outstanding search is worth collecting before giving up on the
 * ticket and asking again. Generous, because collecting is free and a search
 * SerpApi is still grinding through is not a search that failed.
 */
export const PENDING_MS = 24 * 60 * 60 * 1000;

/*
 * What identifies a query, and deliberately not who asked it.
 *
 * Only the fields that change what SerpApi is sent belong here. The employment
 * filter does not: it is applied to the results afterwards, so folding it in
 * would split one shared answer into a row per combination of filters and
 * throw away the whole point of sharing them. The raw listings are stored and
 * each caller filters the copy it reads.
 */
export function cacheSignature(query: Pick<JobSearchQuery, "keywords" | "employer" | "location" | "country">): string {
  const part = (value: string | undefined | null) =>
    (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  return [
    part(query.keywords),
    part(query.employer),
    part(query.location),
    part(query.country),
  ].join("|");
}

export type CacheRow = {
  signature: string;
  /** Raw SerpApi listings, kept unfiltered so every caller can filter its own. */
  listings: unknown[] | null;
  collected_at: string | null;
  /** An outstanding SerpApi ticket, when a search was submitted and not yet read. */
  serpapi_search_id: string | null;
  submitted_at: string | null;
};

export type CachePlan =
  /** Serve it and ask nobody. */
  | { use: "cached"; refresh: false }
  /** Serve it now, and put a fresh search in flight behind the person. */
  | { use: "cached"; refresh: true }
  /** A ticket is outstanding; reading it is free, so read it. */
  | { use: "collect"; searchId: string }
  /** Nothing usable. Submit, and take whatever comes back inside the budget. */
  | { use: "submit" };

/**
 * What to do about a query, given whatever is on file for it.
 *
 * Every branch is cheap except the last, which is the only one that spends
 * from the allowance — that ordering is the whole design.
 */
export function planFromCache(row: CacheRow | null, now: number = Date.now()): CachePlan {
  if (!row) return { use: "submit" };

  const collectedAt = row.collected_at ? Date.parse(row.collected_at) : NaN;
  const hasListings = Array.isArray(row.listings) && row.listings.length > 0;

  if (hasListings && Number.isFinite(collectedAt)) {
    const age = now - collectedAt;
    if (age <= FRESH_MS) return { use: "cached", refresh: false };
    if (age <= STALE_MS) return { use: "cached", refresh: true };
    /* Old enough that an advert may be gone. Ask again rather than mislead. */
    return { use: "submit" };
  }

  if (row.serpapi_search_id) {
    const submittedAt = row.submitted_at ? Date.parse(row.submitted_at) : NaN;
    const waiting = Number.isFinite(submittedAt) ? now - submittedAt : Infinity;
    /*
     * Collecting costs nothing, so an outstanding ticket is always worth one
     * read. Only a ticket old enough to have been forgotten by SerpApi is
     * abandoned in favour of asking again.
     */
    if (waiting <= PENDING_MS) return { use: "collect", searchId: row.serpapi_search_id };
  }

  return { use: "submit" };
}

/**
 * Whether a plan spends from the monthly allowance.
 *
 * Used to ration honestly: a search served from the cache, or collected from a
 * ticket already paid for, should not count against the number of deep queries
 * a run is allowed. Rationing free work is how a provider ends up contributing
 * less the better the cache gets, which is exactly backwards.
 */
export function spendsAllowance(plan: CachePlan): boolean {
  return plan.use === "submit" || (plan.use === "cached" && plan.refresh);
}
