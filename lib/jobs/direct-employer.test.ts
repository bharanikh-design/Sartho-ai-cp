import { describe, expect, it } from "vitest";
import {
  AGGREGATOR_BOARD_HOSTS,
  APPLICANT_TRACKING_HOSTS,
  employerOwnsHost,
  isAggregatorBoard,
  isDirectEmployerDestination,
} from "./destination";
import { getStoredSearch, isAuthoritativeEmptySearch, keepDirectEmployers } from "./run-search";
import { chooseApplyUrl } from "./serpapi";

/*
 * "Direct employers only" used to do nothing. Removing search-engine dead
 * ends was its whole implementation, and once that became unconditional the
 * toggle was left promising a choice it could not make.
 *
 * What it means now is one question about the destination: does applying take
 * you to the employer, or to a marketplace reposting them? Nothing here
 * identifies an agency — guessing that from a company name hides real
 * employers, which is why the rule is about where the link goes.
 */
describe("what counts as a direct employer", () => {
  it("treats an applicant tracking system as the employer's own front door", () => {
    /*
     * The distinction that makes the setting usable rather than punishing.
     * A Greenhouse or Workday link is the employer's hiring pipeline under a
     * vendor's domain; applying there is applying to them. Counting these as
     * third parties would hide most of the tech market.
     */
    for (const url of [
      "https://boards.greenhouse.io/acme/jobs/1",
      "https://jobs.lever.co/acme/2",
      "https://acme.wd1.myworkdayjobs.com/careers/job/3",
      "https://acme.bamboohr.com/careers/4",
      "https://jobs.ashbyhq.com/acme/5",
    ]) {
      expect(isDirectEmployerDestination(url, "Acme Corp"), url).toBe(true);
      expect(isAggregatorBoard(url), url).toBe(false);
    }
  });

  it("treats a job board as a marketplace, not the employer", () => {
    for (const url of [
      "https://www.linkedin.com/jobs/view/1",
      "https://uk.indeed.com/viewjob?jk=2",
      "https://www.glassdoor.co.uk/job-listing/3",
      "https://www.mycareersfuture.gov.sg/job/4",
      "https://www.seek.com.au/job/5",
    ]) {
      expect(isDirectEmployerDestination(url, "Acme Corp"), url).toBe(false);
      expect(isAggregatorBoard(url), url).toBe(true);
    }
  });

  /*
   * The safety property, and the reason this filter is lenient rather than
   * strict. An unfamiliar host is overwhelmingly likely to be a careers site
   * whose domain does not string-match the company name — "join-us.io" for
   * Acme Corp. Hiding unless recognised would bury exactly the direct
   * employers the setting exists to surface, and nobody would ever learn
   * what they had lost.
   */
  it("keeps an unfamiliar host rather than guessing against it", () => {
    for (const url of [
      "https://join-us.io/roles/1",
      "https://acme-careers.example/2",
      "https://werkenbij.someemployer.nl/3",
    ]) {
      expect(isDirectEmployerDestination(url, "Acme Corp"), url).toBe(true);
    }
  });

  it("lets a marketplace hiring for itself count as direct", () => {
    /* LinkedIn's own vacancies are on linkedin.com, and are as direct as anyone's. */
    expect(isDirectEmployerDestination("https://www.linkedin.com/jobs/view/9", "LinkedIn")).toBe(true);
    expect(isDirectEmployerDestination("https://uk.indeed.com/viewjob?jk=9", "Indeed")).toBe(true);
  });

  describe("employerOwnsHost", () => {
    it("matches through punctuation and subdomains", () => {
      expect(employerOwnsHost("https://careers.acmecorp.com/1", "Acme Corp.")).toBe(true);
      expect(employerOwnsHost("https://acme-corp.com/jobs", "Acme Corp")).toBe(true);
    });

    it("will not match on a name too short to mean anything", () => {
      /* A two-letter name is a substring of half the web. */
      expect(employerOwnsHost("https://bp-international-holdings.com/1", "BP")).toBe(false);
      expect(employerOwnsHost("https://anything.com/1", "")).toBe(false);
      expect(employerOwnsHost("https://anything.com/1", null)).toBe(false);
    });

    it("does not fall over on a URL that will not parse", () => {
      expect(employerOwnsHost("not a url", "Acme Corp")).toBe(false);
      expect(isAggregatorBoard("not a url")).toBe(false);
    });
  });

  it("never files a host in both halves", () => {
    /*
     * The halves are now consulted in order — tracking system first, board
     * second — by both `chooseApplyUrl` and this filter. A host appearing in
     * both would make the answer depend on which list was checked first,
     * which is the kind of ambiguity that only shows up as a bug months
     * later.
     */
    const overlap = AGGREGATOR_BOARD_HOSTS.filter((host) => APPLICANT_TRACKING_HOSTS.includes(host));
    expect(overlap, "hosts filed as both a marketplace and a tracking system").toEqual([]);
  });
});

describe("keepDirectEmployers", () => {
  const match = (url: string, employer: string | null = "Acme Corp") => ({ url, employer });

  /*
   * The property that makes the rest of this safe to ship. Nobody who has not
   * deliberately chosen the strict option can lose a single listing, so the
   * default page is exactly what it was.
   */
  it("removes nothing at all when the toggle is off", () => {
    const matches = [
      match("https://www.linkedin.com/jobs/view/1"),
      match("https://boards.greenhouse.io/acme/2"),
    ];
    expect(keepDirectEmployers(matches, false)).toEqual({ kept: matches, hidden: 0 });
  });

  it("keeps employer and ATS destinations, removes the boards, and counts them", () => {
    const matches = [
      match("https://www.linkedin.com/jobs/view/1"),
      match("https://boards.greenhouse.io/acme/2"),
      match("https://careers.acmecorp.com/3"),
      match("https://uk.indeed.com/viewjob?jk=4"),
    ];
    const { kept, hidden } = keepDirectEmployers(matches, true);
    expect(kept.map((item) => item.url)).toEqual([
      "https://boards.greenhouse.io/acme/2",
      "https://careers.acmecorp.com/3",
    ]);
    expect(hidden).toBe(2);
  });

  /*
   * It can empty the page, and that is allowed here for a reason the removed
   * stand-down in dropSearchEnginePages did not have: these are real jobs,
   * the person asked for this, and searchFilterNotes tells them the count and
   * which button brings them back. Quietly overriding the choice would be the
   * same lie the old stand-down told.
   */
  it("will empty the page for somebody who asked it to", () => {
    const matches = [
      match("https://www.linkedin.com/jobs/view/1"),
      match("https://uk.indeed.com/viewjob?jk=2"),
    ];
    expect(keepDirectEmployers(matches, true)).toEqual({ kept: [], hidden: 2 });
  });

  it("copes with a listing that never got an employer name", () => {
    /* No name is not a reason to hide a perfectly good careers-page link. */
    const matches = [match("https://join-us.io/roles/1", null), match("https://www.linkedin.com/jobs/view/2", null)];
    const { kept, hidden } = keepDirectEmployers(matches, true);
    expect(kept.map((item) => item.url)).toEqual(["https://join-us.io/roles/1"]);
    expect(hidden).toBe(1);
  });

  it("is a no-op on an empty set", () => {
    expect(keepDirectEmployers([], true)).toEqual({ kept: [], hidden: 0 });
  });
});

/*
 * "Searched, and nothing survived" is not the same as "never searched".
 *
 * They look identical from the results array, and reading only the array is
 * what made the page auto-run a fresh provider search on every visit. A
 * strict-filter run that legitimately ends empty would have fed that loop
 * forever, so the row's existence — not its length — is what answers the
 * question now.
 */
describe("getStoredSearch tells an empty search from no search", () => {
  const clientReturning = (row: unknown) => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  }) as unknown as Parameters<typeof getStoredSearch>[0];

  const row = (results: unknown[]) => ({
    results,
    criteria: { country: "uk", jobBoardHidden: 4 },
    searched_at: "2026-09-27T00:00:00.000Z",
  });

  it("answers null only when there is no row at all", async () => {
    expect(await getStoredSearch(clientReturning(null), "u1")).toBeNull();
  });

  it("keeps the criteria of a run whose results were all filtered away", async () => {
    const stored = await getStoredSearch(clientReturning(row([])), "u1");
    expect(stored, "an empty run is still a run").not.toBeNull();
    expect(stored!.results).toEqual([]);
    /* The count is what lets the page explain itself rather than look untouched. */
    expect(stored!.criteria.jobBoardHidden).toBe(4);
    expect(stored!.searchedAt).toBe("2026-09-27T00:00:00.000Z");
  });

  /*
   * Rows like this already exist, written by the upsert when it was
   * unconditional — some of them by provider outages. Reading one as a
   * finished search would leave that person on a permanently empty page with
   * the arrival search suppressed forever and no note to explain any of it.
   */
  it("does not mistake a legacy empty row for a filtered search", async () => {
    const legacy = { results: [], criteria: { country: "uk" }, searched_at: "2026-09-01T00:00:00.000Z" };
    expect(await getStoredSearch(clientReturning(legacy), "u1"), "no provenance, so not an answer").toBeNull();
  });

  it("accepts an empty row explained by either of our own filters", async () => {
    for (const criteria of [{ jobBoardHidden: 3 }, { agencyOrUnverifiedHidden: 2 }]) {
      const stored = await getStoredSearch(
        clientReturning({ results: [], criteria, searched_at: "2026-09-27T00:00:00.000Z" }),
        "u1",
      );
      expect(stored, JSON.stringify(criteria)).not.toBeNull();
    }
  });

  /*
   * An incomplete run is not an authoritative empty answer. One provider
   * dying while the survivor happens to return only board links produces a
   * positive hidden count from a search that never finished — and freezing
   * that into the stored row would suppress the arrival retry for as long as
   * it sat there.
   */
  it("will not accept an empty row from a run where a provider failed", async () => {
    const partial = {
      results: [],
      criteria: { jobBoardHidden: 5, providerErrors: ["Adzuna: 429 Too Many Requests"] },
      searched_at: "2026-09-27T00:00:00.000Z",
    };
    expect(await getStoredSearch(clientReturning(partial), "u1")).toBeNull();
  });

  it("still drops individual rows it cannot render, without discarding the search", async () =>{
    const stored = await getStoredSearch(
      clientReturning(row([
        { title: "Reliability Engineer", url: "https://careers.acmecorp.com/1", description: "Ops." },
        { title: "Dead end", url: "https://www.google.com/search?q=x", description: "" },
        { title: "", url: "https://careers.acmecorp.com/3", description: "" },
      ])),
      "u1",
    );
    expect(stored!.results.map((item) => item.url)).toEqual(["https://careers.acmecorp.com/1"]);
  });
});


/*
 * The hole this filter opened in `chooseApplyUrl`, and the reason the two
 * host lists are now consulted in order.
 */
describe("an advert carrying both a board and a direct route", () => {
  const advert = (...links: string[]) => ({
    company_name: "Northwind Logistics",
    share_link: "https://www.google.com/search?q=northwind#job",
    apply_options: links.map((link) => ({ title: "Apply", link })),
  });

  it("sends people to the tracking system even when the board is listed first", () => {
    /*
     * Ranked as one undifferentiated set, whichever came first in
     * apply_options won — so this advert sent people to the repost while the
     * employer's own application sat one entry below it.
     */
    expect(chooseApplyUrl(advert(
      "https://www.linkedin.com/jobs/view/1",
      "https://boards.greenhouse.io/northwind/jobs/2",
    ))).toBe("https://boards.greenhouse.io/northwind/jobs/2");
  });

  it("survives Direct employers only, because it was never board-only", () => {
    /*
     * The consequence that made the ordering a defect rather than a
     * preference: the filter reads the chosen URL, so picking the board
     * route hid an advert that carried a perfectly good direct one.
     */
    const url = chooseApplyUrl(advert(
      "https://www.linkedin.com/jobs/view/1",
      "https://boards.greenhouse.io/northwind/jobs/2",
    ))!;
    const { kept } = keepDirectEmployers([{ url, employer: "Northwind Logistics" }], true);
    expect(kept).toHaveLength(1);
  });

  it("still uses the board when that is the only route on offer", () => {
    expect(chooseApplyUrl(advert("https://www.linkedin.com/jobs/view/1")))
      .toBe("https://www.linkedin.com/jobs/view/1");
  });

  it("keeps the employer's own domain ahead of both", () => {
    expect(chooseApplyUrl(advert(
      "https://boards.greenhouse.io/northwind/jobs/2",
      "https://careers.northwindlogistics.com/3",
    ))).toBe("https://careers.northwindlogistics.com/3");
  });
});


/*
 * The rule both sides of the stored row ask, in one place.
 *
 * The write side decides whether an empty run may replace a good stored set;
 * the read side decides whether an empty stored row is a finished search.
 * Same question — and when they were two expressions rather than one
 * function, the disagreement between them produced defects on two separate
 * review rounds.
 */
describe("isAuthoritativeEmptySearch", () => {
  it("accepts an empty page our own filtering produced", () => {
    expect(isAuthoritativeEmptySearch({ jobBoardHidden: 3 })).toBe(true);
    expect(isAuthoritativeEmptySearch({ agencyOrUnverifiedHidden: 1 })).toBe(true);
  });

  it("rejects an empty page nothing accounts for", () => {
    /* No advert was removed, so nothing here explains why the page is bare. */
    expect(isAuthoritativeEmptySearch({})).toBe(false);
    expect(isAuthoritativeEmptySearch({ jobBoardHidden: 0, agencyOrUnverifiedHidden: 0 })).toBe(false);
  });

  it("rejects a run where a provider failed, however much was filtered", () => {
    /*
     * The count is real but the search is not complete: a provider that never
     * answered might have carried the direct-employer roles. Treating this as
     * the final word would bury a transient outage in the database.
     */
    expect(isAuthoritativeEmptySearch({
      jobBoardHidden: 12,
      providerErrors: ["Google for Jobs (SerpApi) is not configured."],
    })).toBe(false);
  });
});
