import { describe, expect, it } from "vitest";
import { MIN_RETRY_CALLS, RETRY_PAUSE_MS, shouldRetrySearch } from "./search-retry";

const base = { found: 0, troubled: true, retryable: true, remainingMs: 60_000, leadCallBudgetMs: 4_000 };

describe("shouldRetrySearch", () => {
  it("retries a troubled, empty first attempt when there is time for a real second one", () => {
    expect(shouldRetrySearch(base)).toBe(true);
  });

  it("never retries once anything at all was found", () => {
    expect(shouldRetrySearch({ ...base, found: 1 })).toBe(false);
  });

  /*
   * No errors and no timeouts means the providers answered and had nothing.
   * Asking again finds the same nothing, and costs the person the pause.
   */
  it("does not retry an empty market that had no trouble", () => {
    expect(shouldRetrySearch({ ...base, troubled: false })).toBe(false);
  });

  it("does not retry when every provider is out for a reason a pause cannot mend", () => {
    expect(shouldRetrySearch({ ...base, retryable: false })).toBe(false);
  });

  it("needs the pause plus a few calls' worth of budget, sized to the provider that would lead", () => {
    const needed = RETRY_PAUSE_MS + 4_000 * MIN_RETRY_CALLS;
    expect(shouldRetrySearch({ ...base, remainingMs: needed })).toBe(true);
    expect(shouldRetrySearch({ ...base, remainingMs: needed - 1 })).toBe(false);
    /* A slow lead provider raises the bar. */
    expect(shouldRetrySearch({ ...base, remainingMs: needed, leadCallBudgetMs: 9_000 })).toBe(false);
  });
});
