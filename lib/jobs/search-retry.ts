/*
 * Whether a search that found nothing deserves a second attempt.
 *
 * The first attempt failing is not, by itself, a reason to try again: a
 * missing key or a spent monthly allowance fails the same way twice, and a
 * budget already spent on timeouts has nothing left to try with. What earns
 * a retry is trouble a pause can mend — a rate-limit blip, a provider that
 * was briefly unreachable — with enough time left for the attempt to reach
 * the queries that matter, which are the first few.
 *
 * Pure and small on purpose: the decision used to be impossible to test
 * without a database, a provider and a clock, and this is the part that has
 * to be right.
 */

/** Long enough for a rate limit to lapse, short enough not to be noticed. */
export const RETRY_PAUSE_MS = 1_500;

/**
 * A second attempt is worth making only if it can afford this many calls to
 * whichever provider will lead it. The first queries in a plan are the bare
 * target roles; fewer than three of them is not an attempt, it is a gesture.
 */
export const MIN_RETRY_CALLS = 3;

export type RetryDecisionInput = {
  /** Results the first attempt collected. Anything at all means no retry. */
  found: number;
  /** Whether the first attempt met errors or timeouts, rather than an empty market. */
  troubled: boolean;
  /** Whether a provider is left that a retry could ask: alive, or retired for a reason a pause can mend. */
  retryable: boolean;
  remainingMs: number;
  /** What one call to the provider that would lead the retry is given. */
  leadCallBudgetMs: number;
  pauseMs?: number;
};

export function shouldRetrySearch(input: RetryDecisionInput): boolean {
  if (input.found > 0) return false;
  if (!input.troubled || !input.retryable) return false;
  const pause = input.pauseMs ?? RETRY_PAUSE_MS;
  return input.remainingMs >= pause + input.leadCallBudgetMs * MIN_RETRY_CALLS;
}
