import { afterEach, describe, expect, it } from "vitest";
import { searchSerpApiCached, type SearchCacheStore } from "@/lib/jobs/cached-serpapi";
import { FRESH_MS, STALE_MS, type CacheRow } from "@/lib/jobs/search-cache";

const NOW = Date.parse("2026-09-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const listing = {
  title: "Engagement Manager",
  company_name: "Oliver Wyman",
  description: "Lead client engagements across insurance and asset management.",
  apply_options: [{ title: "Oliver Wyman", link: "https://oliverwyman.com/jobs/1" }],
};

const query = { keywords: "Engagement Manager", country: "sg" };

/* The store as a plain object, so every branch is drivable without a database. */
function fakeStore(initial: CacheRow | null = null) {
  let row = initial;
  const calls = { saveListings: 0, saveTicket: 0, clearTicket: 0 };
  const store: SearchCacheStore = {
    read: async () => row,
    saveListings: async (signature, listings) => {
      calls.saveListings += 1;
      row = { ...(row ?? { signature, serpapi_search_id: null, submitted_at: null }), signature, listings, collected_at: new Date(NOW).toISOString(), serpapi_search_id: null, submitted_at: row?.submitted_at ?? null };
    },
    saveTicket: async (signature, searchId) => {
      calls.saveTicket += 1;
      row = { ...(row ?? { signature, listings: null, collected_at: null }), signature, listings: row?.listings ?? null, collected_at: row?.collected_at ?? null, serpapi_search_id: searchId, submitted_at: new Date(NOW).toISOString() };
    },
    clearTicket: async () => {
      calls.clearTicket += 1;
      if (row) row = { ...row, serpapi_search_id: null, submitted_at: null };
    },
  };
  return { store, calls, current: () => row };
}

afterEach(() => {
  delete process.env.SERPAPI_KEY;
  delete process.env.SERPAPI_API_KEY;
});

describe("searchSerpApiCached", () => {
  it("refuses to run without a key", async () => {
    const { store } = fakeStore();
    await expect(searchSerpApiCached(query, store)).rejects.toThrow(/not configured/i);
  });

  it("serves a recent answer without spending a search", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store } = fakeStore({
      signature: "engagement manager|||sg",
      listings: [listing],
      collected_at: ago(60_000),
      serpapi_search_id: null,
      submitted_at: null,
    });

    const outcome = await searchSerpApiCached(query, store, {
      submit: async () => { throw new Error("must not submit for a fresh hit"); },
      collect: async () => { throw new Error("must not collect for a fresh hit"); },
      now: () => NOW,
    });

    expect(outcome.source).toBe("cache");
    expect(outcome.spent).toBe(false);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].title).toBe("Engagement Manager");
  });

  /*
   * The branch that pays for the whole design: a search abandoned by an earlier
   * run, read at last, for nothing.
   */
  it("collects yesterday's abandoned search for free", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store, calls } = fakeStore({
      signature: "engagement manager|||sg",
      listings: null,
      collected_at: null,
      serpapi_search_id: "ticket-1",
      submitted_at: ago(8 * 60 * 60 * 1000),
    });

    const outcome = await searchSerpApiCached(query, store, {
      submit: async () => { throw new Error("must not pay for a search already bought"); },
      collect: async (id) => {
        expect(id).toBe("ticket-1");
        return { search_metadata: { status: "Success" }, jobs_results: [listing] };
      },
      now: () => NOW,
    });

    expect(outcome.source).toBe("collected");
    expect(outcome.spent).toBe(false);
    expect(outcome.results).toHaveLength(1);
    /* And kept, so the next search does not even need the archive. */
    expect(calls.saveListings).toBe(1);
  });

  it("leaves a still-running ticket on file rather than paying for a second copy", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store, calls, current } = fakeStore({
      signature: "engagement manager|||sg",
      listings: null,
      collected_at: null,
      serpapi_search_id: "ticket-1",
      submitted_at: ago(60_000),
    });

    await expect(searchSerpApiCached(query, store, {
      submit: async () => { throw new Error("must not submit while one is running"); },
      collect: async () => ({ search_metadata: { status: "Processing" } }),
      now: () => NOW,
    })).rejects.toThrow(/still working/i);

    expect(calls.clearTicket).toBe(0);
    expect(current()?.serpapi_search_id).toBe("ticket-1");
  });

  it("gives up on a ticket the archive cannot read", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store, calls } = fakeStore({
      signature: "engagement manager|||sg",
      listings: null,
      collected_at: null,
      serpapi_search_id: "ticket-gone",
      submitted_at: ago(60_000),
    });

    await expect(searchSerpApiCached(query, store, {
      collect: async () => { throw new Error("SerpApi archive returned 404"); },
      now: () => NOW,
    })).rejects.toThrow(/404/);

    expect(calls.clearTicket).toBe(1);
  });

  /*
   * The ticket is written before anything else can go wrong. A search submitted
   * and not recorded is charged for and never read, which is the exact waste
   * this file replaced.
   */
  it("records the ticket when a fresh submission does not come back in time", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store, calls, current } = fakeStore(null);

    await expect(searchSerpApiCached(query, store, {
      submit: async () => ({ id: "ticket-new", body: null }),
      now: () => NOW,
    })).rejects.toThrow(/still working/i);

    expect(calls.saveTicket).toBe(1);
    expect(current()?.serpapi_search_id).toBe("ticket-new");
  });

  it("uses an answer that arrives on the spot and keeps it", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store, calls } = fakeStore(null);

    const outcome = await searchSerpApiCached(query, store, {
      submit: async () => ({ id: null, body: { jobs_results: [listing] } }),
      now: () => NOW,
    });

    expect(outcome.source).toBe("live");
    expect(outcome.spent).toBe(true);
    expect(outcome.results).toHaveLength(1);
    expect(calls.saveListings).toBe(1);
  });

  it("serves a stale answer now and refreshes behind the person", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store, calls } = fakeStore({
      signature: "engagement manager|||sg",
      listings: [listing],
      collected_at: ago(FRESH_MS + 60_000),
      serpapi_search_id: null,
      submitted_at: null,
    });

    let submitted = false;
    const outcome = await searchSerpApiCached(query, store, {
      submit: async () => { submitted = true; return { id: "ticket-refresh", body: null }; },
      now: () => NOW,
    });

    /* The person waits for nothing; the refresh lands for whoever asks next. */
    expect(outcome.source).toBe("cache");
    expect(outcome.results).toHaveLength(1);
    expect(submitted).toBe(true);
    expect(calls.saveTicket).toBe(1);
  });

  it("still answers when the refresh cannot be started", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store } = fakeStore({
      signature: "engagement manager|||sg",
      listings: [listing],
      collected_at: ago(FRESH_MS + 60_000),
      serpapi_search_id: null,
      submitted_at: null,
    });

    const outcome = await searchSerpApiCached(query, store, {
      submit: async () => { throw new Error("SerpApi returned 503"); },
      now: () => NOW,
    });

    expect(outcome.results).toHaveLength(1);
    expect(outcome.source).toBe("cache");
  });

  it("asks again for an answer old enough that the advert may be gone", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store } = fakeStore({
      signature: "engagement manager|||sg",
      listings: [listing],
      collected_at: ago(STALE_MS + 60_000),
      serpapi_search_id: null,
      submitted_at: null,
    });

    let submitted = false;
    await expect(searchSerpApiCached(query, store, {
      submit: async () => { submitted = true; return { id: "t", body: null }; },
      now: () => NOW,
    })).rejects.toThrow(/still working/i);

    expect(submitted).toBe(true);
  });

  /* A cache that cannot be read must never be the reason a search fails. */
  it("falls back to asking SerpApi when the store is broken", async () => {
    process.env.SERPAPI_KEY = "k1";
    const broken: SearchCacheStore = {
      read: async () => { throw new Error("relation does not exist"); },
      saveListings: async () => { throw new Error("relation does not exist"); },
      saveTicket: async () => { throw new Error("relation does not exist"); },
      clearTicket: async () => { throw new Error("relation does not exist"); },
    };

    const outcome = await searchSerpApiCached(query, broken, {
      submit: async () => ({ id: null, body: { jobs_results: [listing] } }),
      now: () => NOW,
    });

    expect(outcome.results).toHaveLength(1);
    expect(outcome.source).toBe("live");
  });

  it("applies the employment filter to a cached answer, since the cache is unfiltered", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store } = fakeStore({
      signature: "engagement manager|||sg",
      listings: [
        { ...listing, detected_extensions: { schedule_type: "Full-time" } },
        { ...listing, title: "Intern", detected_extensions: { schedule_type: "Internship" } },
      ],
      collected_at: ago(60_000),
      serpapi_search_id: null,
      submitted_at: null,
    });

    const outcome = await searchSerpApiCached(
      { ...query, employmentTypes: ["Full-time"] },
      store,
      { now: () => NOW },
    );

    expect(outcome.results.map((item) => item.title)).toEqual(["Engagement Manager"]);
  });
});

/*
 * The ration counts searches bought, not queries answered.
 *
 * Rationing free work would mean the deep provider contributing less the
 * better the cache gets, which is exactly backwards — and the cache only
 * compounds if every free hit is allowed through.
 */
describe("a run that has spent its ration", () => {
  it("still serves a cached answer", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store } = fakeStore({
      signature: "engagement manager|||sg",
      listings: [listing],
      collected_at: ago(60_000),
      serpapi_search_id: null,
      submitted_at: null,
    });

    const outcome = await searchSerpApiCached(query, store, { allowSpend: false, now: () => NOW });
    expect(outcome.results).toHaveLength(1);
    expect(outcome.spent).toBe(false);
  });

  it("still collects a ticket already paid for", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store } = fakeStore({
      signature: "engagement manager|||sg",
      listings: null,
      collected_at: null,
      serpapi_search_id: "ticket-1",
      submitted_at: ago(60_000),
    });

    const outcome = await searchSerpApiCached(query, store, {
      allowSpend: false,
      collect: async () => ({ search_metadata: { status: "Success" }, jobs_results: [listing] }),
      now: () => NOW,
    });

    expect(outcome.source).toBe("collected");
    expect(outcome.results).toHaveLength(1);
  });

  it("does not buy a search for a title it has never seen", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store, calls } = fakeStore(null);

    let submitted = false;
    const outcome = await searchSerpApiCached(query, store, {
      allowSpend: false,
      submit: async () => { submitted = true; return { id: "t", body: null }; },
      now: () => NOW,
    });

    /* Empty, so the query falls through to the provider behind this one. */
    expect(outcome.results).toEqual([]);
    expect(outcome.spent).toBe(false);
    expect(submitted).toBe(false);
    expect(calls.saveTicket).toBe(0);
  });

  it("does not buy a refresh behind a stale answer", async () => {
    process.env.SERPAPI_KEY = "k1";
    const { store } = fakeStore({
      signature: "engagement manager|||sg",
      listings: [listing],
      collected_at: ago(FRESH_MS + 60_000),
      serpapi_search_id: null,
      submitted_at: null,
    });

    let submitted = false;
    const outcome = await searchSerpApiCached(query, store, {
      allowSpend: false,
      submit: async () => { submitted = true; return { id: "t", body: null }; },
      now: () => NOW,
    });

    /* The stale answer is still worth showing; the refresh can wait for a run with budget. */
    expect(outcome.results).toHaveLength(1);
    expect(submitted).toBe(false);
    expect(outcome.spent).toBe(false);
  });
});
