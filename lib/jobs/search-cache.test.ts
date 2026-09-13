import { describe, expect, it } from "vitest";
import {
  cacheSignature,
  FRESH_MS,
  planFromCache,
  PENDING_MS,
  spendsAllowance,
  STALE_MS,
  type CacheRow,
} from "@/lib/jobs/search-cache";

const NOW = Date.parse("2026-09-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const row = (over: Partial<CacheRow> = {}): CacheRow => ({
  signature: "engagement manager||singapore|sg",
  listings: null,
  collected_at: null,
  serpapi_search_id: null,
  submitted_at: null,
  ...over,
});

const listings = [{ title: "Engagement Manager" }];

describe("cacheSignature", () => {
  it("is the same question however it was typed", () => {
    const a = cacheSignature({ keywords: "Engagement Manager", country: "SG", location: "Singapore" });
    const b = cacheSignature({ keywords: "  engagement   manager ", country: "sg", location: "singapore" });
    expect(a).toBe(b);
  });

  it("separates different roles", () => {
    expect(cacheSignature({ keywords: "Engagement Manager", country: "sg" }))
      .not.toBe(cacheSignature({ keywords: "Delivery Director", country: "sg" }));
  });

  it("separates the same role in different markets", () => {
    expect(cacheSignature({ keywords: "Engagement Manager", country: "sg" }))
      .not.toBe(cacheSignature({ keywords: "Engagement Manager", country: "au" }));
  });

  it("separates a query aimed at one employer", () => {
    expect(cacheSignature({ keywords: "Engagement Manager", employer: "Accenture", country: "sg" }))
      .not.toBe(cacheSignature({ keywords: "Engagement Manager", country: "sg" }));
  });

  /*
   * The property the whole shared cache rests on. Employment type is filtered
   * off the results afterwards, so folding it into the signature would split
   * one shared answer into a row per filter combination.
   */
  it("ignores filters that are applied to the results rather than sent", () => {
    const base = { keywords: "Engagement Manager", country: "sg" } as const;
    expect(cacheSignature({ ...base, employmentTypes: ["Full-time"] } as never))
      .toBe(cacheSignature({ ...base, employmentTypes: ["Contract"] } as never));
  });

  it("holds nothing about who asked", () => {
    const signature = cacheSignature({ keywords: "Engagement Manager", country: "sg" });
    expect(signature).toBe("engagement manager|||sg");
  });
});

describe("planFromCache", () => {
  it("submits when nothing is on file", () => {
    expect(planFromCache(null, NOW)).toEqual({ use: "submit" });
  });

  it("serves a recent answer without asking anybody", () => {
    expect(planFromCache(row({ listings, collected_at: ago(60_000) }), NOW))
      .toEqual({ use: "cached", refresh: false });
  });

  it("serves a day-old answer and refreshes behind the person", () => {
    expect(planFromCache(row({ listings, collected_at: ago(FRESH_MS + 60_000) }), NOW))
      .toEqual({ use: "cached", refresh: true });
  });

  it("stops serving an answer old enough that the advert may be gone", () => {
    expect(planFromCache(row({ listings, collected_at: ago(STALE_MS + 60_000) }), NOW))
      .toEqual({ use: "submit" });
  });

  /* The point of the whole thing: a search already paid for, read for free. */
  it("collects an outstanding ticket rather than paying again", () => {
    expect(planFromCache(row({ serpapi_search_id: "abc", submitted_at: ago(60_000) }), NOW))
      .toEqual({ use: "collect", searchId: "abc" });
  });

  it("still collects a ticket left over from yesterday's search", () => {
    expect(planFromCache(row({ serpapi_search_id: "abc", submitted_at: ago(PENDING_MS - 60_000) }), NOW))
      .toEqual({ use: "collect", searchId: "abc" });
  });

  it("gives up on a ticket old enough to have been forgotten", () => {
    expect(planFromCache(row({ serpapi_search_id: "abc", submitted_at: ago(PENDING_MS + 60_000) }), NOW))
      .toEqual({ use: "submit" });
  });

  it("prefers a stored answer over an outstanding ticket", () => {
    const plan = planFromCache(row({
      listings,
      collected_at: ago(60_000),
      serpapi_search_id: "abc",
      submitted_at: ago(30_000),
    }), NOW);
    expect(plan).toEqual({ use: "cached", refresh: false });
  });

  it("treats an empty stored answer as nothing stored", () => {
    /* A row written before its result arrived must not serve zero roles. */
    expect(planFromCache(row({ listings: [], collected_at: ago(60_000) }), NOW))
      .toEqual({ use: "submit" });
  });

  it("does not trust a row whose timestamp is unreadable", () => {
    expect(planFromCache(row({ listings, collected_at: "not a date" }), NOW))
      .toEqual({ use: "submit" });
  });

  it("asks again for a ticket whose age cannot be established", () => {
    /*
     * A ticket of unknown age could be from last month, and SerpApi's archive
     * does not keep one forever. Submitting costs a search; collecting a dead
     * ticket costs a search AND returns nothing.
     */
    expect(planFromCache(row({ serpapi_search_id: "abc", submitted_at: null }), NOW))
      .toEqual({ use: "submit" });
  });
});

describe("spendsAllowance", () => {
  it("counts a submission", () => {
    expect(spendsAllowance({ use: "submit" })).toBe(true);
  });

  it("counts the refresh behind a stale answer", () => {
    expect(spendsAllowance({ use: "cached", refresh: true })).toBe(true);
  });

  /*
   * Free work must not be rationed, or the provider contributes less the
   * better the cache gets — exactly backwards.
   */
  it("does not count a cache hit", () => {
    expect(spendsAllowance({ use: "cached", refresh: false })).toBe(false);
  });

  it("does not count collecting a search already paid for", () => {
    expect(spendsAllowance({ use: "collect", searchId: "abc" })).toBe(false);
  });
});
