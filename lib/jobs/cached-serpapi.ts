/*
 * SerpApi, asked through Sartho's own memory of it.
 *
 * The plain provider submits a search and polls for it. That is the right shape
 * for one query and the wrong economics for a search: the free plan answers a
 * cold title in more time than a run has to give, so the query is abandoned,
 * and SerpApi's own cache forgets it within the hour. Every search paid for a
 * query it never got to read.
 *
 * Here the ticket is kept. A search abandoned today is collected tomorrow for
 * nothing, because reading SerpApi's archive is free — so the allowance buys
 * answers rather than attempts.
 *
 * The order of preference is also the order of cost, which is the whole design:
 * serve what is stored, else read a ticket already paid for, else pay.
 */

import {
  collectSerpApiSearch,
  jobsFromSerpApiBody,
  readSerpApiStatus,
  serpApiConfig,
  submitSerpApiSearch,
} from "@/lib/jobs/serpapi";
import { cacheSignature, planFromCache, type CachePlan, type CacheRow } from "@/lib/jobs/search-cache";
import type { JobSearchQuery, JobSearchResult } from "@/lib/jobs/search-provider";

/**
 * The store, as the narrowest thing this file needs.
 *
 * An interface rather than a Supabase client so the decision logic can be
 * driven end to end in tests without a database — the part that was never
 * testable in the old provider path, and the part that kept being wrong.
 */
export type SearchCacheStore = {
  read: (signature: string) => Promise<CacheRow | null>;
  saveListings: (signature: string, listings: unknown[]) => Promise<void>;
  saveTicket: (signature: string, searchId: string) => Promise<void>;
  clearTicket: (signature: string) => Promise<void>;
};

export type CachedSearchOutcome = {
  results: JobSearchResult[];
  /** Where the answer came from, for the criteria line and for diagnostics. */
  source: "cache" | "collected" | "live" | "pending";
  /** Whether this query spent one of the month's searches. */
  spent: boolean;
};

/*
 * Why a search still running is an empty answer rather than a failure.
 *
 * The uncached provider polls, so running out of time there really is a
 * disappointment worth counting against it. Here nothing is polled: the query
 * is handed over in about twenty-six milliseconds and the ticket is filed.
 * Nothing went wrong, and the title is now warming for the next run.
 *
 * Counting that as a failure was costing almost everything this cache is for.
 * Two strikes retire a provider, and on a cold cache every query submits — so
 * the very first search would have filed two tickets and abandoned the deep
 * provider for the remaining thirteen queries, warming two titles per search
 * instead of fifteen. An empty answer falls through to the next provider
 * without a strike, which is exactly the intended behaviour: Adzuna fills the
 * page today, and tomorrow those fifteen titles collect for free.
 */

/*
 * A submission fired and not waited on.
 *
 * The ticket is written down first, on purpose. If the process dies between
 * submitting and storing, the search still runs at SerpApi and is charged for,
 * and nothing will ever read it — which is the exact waste this file exists to
 * end. Storing first means the worst case is a ticket for a search that was
 * never submitted, and a ticket that collects to nothing is cheap.
 */
async function submitAndRecord(
  query: JobSearchQuery,
  apiKey: string,
  store: SearchCacheStore,
  signature: string,
  submit: typeof submitSerpApiSearch,
): Promise<unknown | null> {
  const submitted = await submit(query, apiKey);
  if (submitted.id === null) {
    /* Answered on the spot. Nothing outstanding to remember. */
    return submitted.body;
  }
  await store.saveTicket(signature, submitted.id);
  return null;
}

export async function searchSerpApiCached(
  query: JobSearchQuery,
  store: SearchCacheStore,
  deps: {
    collect?: typeof collectSerpApiSearch;
    submit?: typeof submitSerpApiSearch;
    now?: () => number;
    /*
     * Whether this query may buy a search.
     *
     * False once a run has spent its ration. The cheap branches stay open —
     * a cached answer and a ticket already paid for cost nothing, and closing
     * them would mean the deep provider contributing less the better the cache
     * gets. Only the branch that reaches for the wallet is shut.
     */
    allowSpend?: boolean;
  } = {},
): Promise<CachedSearchOutcome> {
  const config = serpApiConfig();
  if (!config) throw new Error("SerpApi is not configured.");

  const collect = deps.collect ?? collectSerpApiSearch;
  const submit = deps.submit ?? submitSerpApiSearch;
  const now = deps.now ?? Date.now;
  const allowSpend = deps.allowSpend ?? true;
  const signature = cacheSignature(query);

  /*
   * A cache that cannot be read must never stop a search. Every branch below
   * degrades to asking SerpApi directly, which is what the code did before this
   * file existed.
   */
  let row: CacheRow | null = null;
  let plan: CachePlan = { use: "submit" };
  try {
    row = await store.read(signature);
    plan = planFromCache(row, now());
  } catch {
    row = null;
    plan = { use: "submit" };
  }

  if (plan.use === "cached") {
    const listings = Array.isArray(row?.listings) ? row.listings : [];
    const results = jobsFromSerpApiBody({ jobs_results: listings }, query);

    if (plan.refresh && allowSpend) {
      /*
       * Refreshed behind the person rather than in front of them: the stored
       * answer is returned now, and the new one lands in the cache for whoever
       * asks next. Failing to start it is not worth failing the search over.
       */
      try {
        const body = await submitAndRecord(query, config.key, store, signature, submit);
        if (body) await store.saveListings(signature, listingsFrom(body));
      } catch {
        /* The stored answer still stands. */
      }
    }

    return { results, source: "cache", spent: plan.refresh && allowSpend };
  }

  if (plan.use === "collect") {
    /*
     * Free. A search somebody already paid for, read at last — this is the
     * branch that turns an abandoned query into an answer.
     */
    try {
      const body = await collect(plan.searchId, config.key);
      if (readSerpApiStatus(body) === "success") {
        const listings = listingsFrom(body);
        await store.saveListings(signature, listings);
        return { results: jobsFromSerpApiBody(body, query), source: "collected", spent: false };
      }
      /*
       * Still grinding. Left on file rather than resubmitted: it costs nothing
       * to try again next time, and paying for a second copy of a search that
       * is already running is the waste this replaced.
       */
      return { results: [], source: "pending", spent: false };
    } catch (caught) {
      /*
       * A ticket the archive cannot read is a dead ticket — expired, or for a
       * search that never ran. Cleared so it is not tried again, and re-thrown
       * because unlike a search still working, this one really is a failure.
       */
      await store.clearTicket(signature).catch(() => undefined);
      throw caught;
    }
  }

  if (!allowSpend) {
    /*
     * Out of ration. Nothing stored and nothing outstanding, so there is
     * nothing to say about this title without buying a search — the query
     * falls through to the provider behind this one, which is what a ration is
     * for.
     */
    return { results: [], source: "cache", spent: false };
  }

  const body = await submitAndRecord(query, config.key, store, signature, submit);
  if (!body) {
    /*
     * Submitted and outstanding. Nothing to show for this query now, and
     * nothing lost either — the ticket is on file and the next search reads it
     * for free. See the note on "pending" above for why this is not a failure.
     */
    return { results: [], source: "pending", spent: true };
  }

  const listings = listingsFrom(body);
  await store.saveListings(signature, listings).catch(() => undefined);
  return { results: jobsFromSerpApiBody(body, query), source: "live", spent: true };
}

/** SerpApi's listings out of whatever came back, without judging them. */
function listingsFrom(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const results = (body as { jobs_results?: unknown }).jobs_results;
  return Array.isArray(results) ? results : [];
}
