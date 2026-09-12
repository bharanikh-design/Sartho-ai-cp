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
  /** Human-readable failures. Every one, for the log and the nobody-answered case. */
  errors: string[];
  /**
   * The failures that actually cost the person something.
   *
   * A provider behind the one that answered can fail all day without changing
   * a single result — the query was already served by the time it would have
   * been asked. Reporting those on the page is noise at best: with JSearch
   * sitting behind SerpApi on a spent RapidAPI allowance, every successful
   * search would have carried "you have exceeded the MONTHLY quota — upgrade
   * your plan at rapidapi.com" under its results. That is a vendor's upsell
   * printed on somebody else's product, for a provider nothing needed.
   *
   * A failure ahead of the answering provider is a different matter and is
   * kept: it means the results came from further down the cascade than they
   * should have, and Adzuna's blurb where Google's full advert was expected is
   * something the person should be told about.
   */
  errorsThatCostResults: () => string[];
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
  /**
   * The longest any one call was given before it timed out, by display name.
   *
   * A timeout count on its own says the provider was slow; it does not say
   * slow compared to what. "Timed out 2 times" against a six-second wait is a
   * budget that was too tight, and against a twenty-second wait it is a
   * provider that is genuinely not answering — opposite diagnoses, and the
   * page could not tell them apart.
   */
  timeoutWaits: Map<string, number>;
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
  /* Kept beside the message so a failure can be placed in the order later. */
  const failedAt: Array<{ provider: JobSearchProviderName; message: string }> = [];
  const used = new Set<string>();
  const timeouts = new Map<string, number>();
  const timeoutWaits = new Map<string, number>();
  let lastCalled = new Set<JobSearchProviderName>();
  let lastAllowedMs = 0;

  function recordFailure(provider: JobSearchProviderName, caught: unknown) {
    /*
     * A missing key is not a flaky call. There is no number of retries that
     * turns an unconfigured provider into a configured one, so it goes out on
     * the first attempt rather than after the usual two.
     */
    if (caught instanceof JobSearchNotConfiguredError) {
      dead.add(provider);
      record(provider, `${providerLabel(provider)} is not configured.`);
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
      timeoutWaits.set(label, Math.max(timeoutWaits.get(label) ?? 0, lastAllowedMs));
      console.warn(`${label} timed out on a query after ${lastAllowedMs}ms`);
      return;
    }
    record(provider, `${providerLabel(provider)}: ${caught instanceof Error ? caught.message : "unknown error"}`);
  }

  function record(provider: JobSearchProviderName, message: string) {
    errors.push(message);
    failedAt.push({ provider, message });
  }

  /*
   * The same failure, phrased for the person rather than for the log.
   *
   * Providers explain their refusals in their own interest. RapidAPI answers a
   * spent allowance with "Upgrade your plan at https://rapidapi.com/..." — and
   * because that string was passed through untouched, a working search printed
   * a vendor's upsell link underneath somebody's job results, for a provider
   * that is not even the one they pay. Nobody reading a list of roles is going
   * to go and buy an API subscription, so the link is not information, it is an
   * advertisement Sartho was relaying for free.
   *
   * The sentence naming the cause is kept. The link and the sales copy after
   * it are not, and the full text still goes to the server log.
   */
  function readable(message: string): string {
    const hadLink = /https?:\/\/\S+/.test(message);
    const withoutLinks = message.replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();

    /*
     * The clause that existed only to carry the link goes with it — "Upgrade
     * your plan at", "See" — or the sentence is left dangling on a preposition.
     * Applied only when a link was actually removed, so an error that happens
     * to end on the word "see" keeps its meaning.
     */
    const trimmed = hadLink
      ? withoutLinks.replace(
          /[\s.,;:—-]*\b(?:upgrade(?:\s+your\s+plan)?|subscribe|sign\s+up|get\s+started|see|visit|go\s+to|available\s+at|more\s+at|details\s+at|learn\s+more)\b[^.!?]*$/i,
          "",
        )
      : withoutLinks;

    return trimmed.replace(/[\s.,;:—-]+$/, "").trim();
  }

  /*
   * Where the results came from, as a position in the order. Everything that
   * failed ahead of it changed what the person got; everything behind it was
   * never reached.
   */
  function errorsThatCostResults(): string[] {
    const answeredAt = providers.findIndex((provider) => used.has(providerLabel(provider)));
    const relevant = answeredAt < 0
      ? failedAt
      : failedAt.filter((failure) => providers.indexOf(failure.provider) < answeredAt);
    return [...new Set(relevant.map((failure) => readable(failure.message)))].filter(Boolean);
  }

  async function run(query: JobSearchQuery): Promise<JobSearchResult[]> {
    /* Remembered for the timeout report: what this call was actually allowed. */
    lastAllowedMs = query.timeoutMs ?? 0;
    const called = new Set<JobSearchProviderName>();
    lastCalled = called;
    for (const provider of providers) {
      if (dead.has(provider)) continue;
      called.add(provider);
      try {
        const results = await search(provider, query);
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
        if (!results.length) continue;
        /*
         * Counted as used only now that it has supplied something.
         *
         * This used to be marked the moment a provider replied without
         * throwing, empty replies included — and `used` has exactly one
         * consumer, the "via Google for Jobs + Adzuna" line under the results.
         * So a provider that carried nothing for any query in the run was
         * still named as a source of the results on the page, and the one
         * honest way to ask "did any of this come from Google" gave the wrong
         * answer. The employer-portal path beside it has always guarded on
         * results; this now matches it.
         */
        used.add(providerLabel(provider));
        return results;
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
    errorsThatCostResults,
    used,
    timeouts,
    timeoutWaits,
  };
}
