import {
  JobSearchNotConfiguredError,
  searchWithProvider,
  type JobSearchProviderName,
  type JobSearchQuery,
  type JobSearchResult,
} from "@/lib/jobs/search-provider";

/*
 * Asking the jobs providers in order, and knowing when to stop asking.
 *
 * This was forty lines of closure inside runBriefSearch, which is why it was
 * never tested and why its central mechanism did not work: the set of failed
 * providers was declared, read in three places, and never written to — the code
 * that should have added to it was a comment saying it was too awkward to reach
 * the provider name from inside a Promise.allSettled. So a provider returning
 * 401 on every call was asked again on every call, for the whole run.
 *
 * The other thing that comment hid is that the providers were not a cascade at
 * all. Every query fanned out to all of them at once and the answers were
 * merged, which spends a metered allowance twice per query and mixes shallow
 * records into a pool ranked on how completely each advert matches. Here they
 * are tried in order and the first provider with something to say ends the
 * query — which is what "fall-back order" meant all along.
 */

export type ProviderCascadeOptions = {
  /** Injected so the cascade is testable without a network. */
  search?: (provider: JobSearchProviderName, query: JobSearchQuery) => Promise<JobSearchResult[]>;
  /**
   * Consecutive failures before a provider is dropped for the rest of the run.
   * Two rather than one: a single timeout is weather, not a broken key, and
   * dropping the deep provider on one blip spends the rest of the search on the
   * shallow one.
   */
  failuresBeforeDead?: number;
};

export type ProviderCascade = {
  /**
   * Run one query down the provider order. Returns everything the first
   * provider with results gave back; an empty array means nobody had anything.
   */
  run: (query: JobSearchQuery) => Promise<JobSearchResult[]>;
  isDead: (provider: JobSearchProviderName) => boolean;
  /**
   * Whether the most recent query actually reached this provider.
   *
   * A rate limit is owed for a request that was made, not for a provider that
   * happens to be configured. JSearch sits behind RapidAPI's one-request-a-
   * second rule, but once SerpApi leads the cascade and answers, JSearch is
   * never called — and pacing a provider nobody asked spends a second of the
   * budget per query to satisfy a limit that was never approached.
   */
  calledLast: (provider: JobSearchProviderName) => boolean;
  /** True once no provider is left worth asking. */
  exhausted: () => boolean;
  /** Human-readable failures, for the criteria line. Deduplicated by the caller. */
  errors: string[];
  /** Providers that actually answered, by display name. */
  used: Set<string>;
  /**
   * How many times each provider ran out of time, by display name.
   *
   * Separate from errors because it is a different thing to say. An error is
   * usually a misconfiguration the reader can fix; a timeout is the provider
   * being slow, and the only thing to do about it is know it happened. It was
   * previously logged to the server console and nowhere else, which made the
   * deep provider dropping out of a search completely invisible — the page
   * simply showed shallower results with no explanation.
   */
  timeouts: Map<string, number>;
};

/** One spelling of each provider's name, for criteria lines and error text. */
export function providerLabel(provider: JobSearchProviderName): string {
  if (provider === "serpapi") return "Google for Jobs (SerpApi)";
  return provider === "jsearch" ? "Google for Jobs" : "Adzuna";
}

export function createProviderCascade(
  providers: JobSearchProviderName[],
  options: ProviderCascadeOptions = {},
): ProviderCascade {
  const search = options.search ?? searchWithProvider;
  const failuresBeforeDead = options.failuresBeforeDead ?? 2;

  const dead = new Set<JobSearchProviderName>();
  const failures = new Map<JobSearchProviderName, number>();
  const errors: string[] = [];
  const used = new Set<string>();
  const timeouts = new Map<string, number>();
  let lastCalled = new Set<JobSearchProviderName>();

  function recordFailure(provider: JobSearchProviderName, caught: unknown) {
    /*
     * A missing key is not a flaky call. There is no number of retries that
     * turns an unconfigured provider into a configured one, so it goes out on
     * the first attempt rather than after the usual two.
     */
    if (caught instanceof JobSearchNotConfiguredError) {
      dead.add(provider);
      errors.push(`${providerLabel(provider)} is not configured.`);
      return;
    }

    const count = (failures.get(provider) ?? 0) + 1;
    failures.set(provider, count);
    if (count >= failuresBeforeDead) dead.add(provider);

    /*
     * A timeout is reported to the console rather than to the person. It says
     * nothing they can act on, and one slow query should not put a red error
     * across a page that did find roles.
     */
    if (caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError")) {
      const label = providerLabel(provider);
      timeouts.set(label, (timeouts.get(label) ?? 0) + 1);
      console.warn(`${label} timed out on a query`);
      return;
    }
    errors.push(`${providerLabel(provider)}: ${caught instanceof Error ? caught.message : "unknown error"}`);
  }

  async function run(query: JobSearchQuery): Promise<JobSearchResult[]> {
    const called = new Set<JobSearchProviderName>();
    lastCalled = called;
    for (const provider of providers) {
      if (dead.has(provider)) continue;
      called.add(provider);
      try {
        const results = await search(provider, query);
        used.add(providerLabel(provider));
        /*
         * A good answer clears the slate. The counter is for a provider that is
         * failing, not for one that has ever failed — otherwise two unrelated
         * timeouts an hour apart in the same run retire a working provider.
         */
        failures.delete(provider);
        /*
         * Empty is not failure, so it does not count against the provider — but
         * it is also not an answer, so the next one is asked. A market where
         * JSearch simply carries nothing for this title is exactly when the
         * fallback earns its place.
         */
        if (results.length) return results;
      } catch (caught) {
        recordFailure(provider, caught);
      }
    }
    return [];
  }

  return {
    run,
    isDead: (provider) => dead.has(provider),
    calledLast: (provider) => lastCalled.has(provider),
    exhausted: () => providers.every((provider) => dead.has(provider)),
    errors,
    used,
    timeouts,
  };
}
