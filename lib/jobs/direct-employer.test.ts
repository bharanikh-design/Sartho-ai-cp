import { describe, expect, it } from "vitest";
import {
  AGGREGATOR_BOARD_HOSTS,
  APPLICANT_TRACKING_HOSTS,
  employerOwnsHost,
  isAggregatorBoard,
  isDirectEmployerDestination,
} from "./destination";
import { getStoredSearch, keepDirectEmployers } from "./run-search";
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
 * A stored row is a snapshot of the settings in force when it was written.
 *
 * Reading it back through the person's *current* source preference is what
 * stops somebody who has just turned "Direct employers only" on being shown
 * yesterday's job-board links. It also replaced a much larger mechanism:
 * storing empty strict runs so they could overwrite the stale set, which
 * required deciding whether a given empty run had really finished. Seven
 * rounds of review found seven ways that decision was wrong.
 */
describe("getStoredSearch reads through the current source preference", () => {
  const clientReturning = (row: unknown) => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  }) as unknown as Parameters<typeof getStoredSearch>[0];

  const board = { title: "Ops Lead", url: "https://www.linkedin.com/jobs/view/1", description: "x", employer: "Acme Corp" };
  const direct = { title: "Ops Lead", url: "https://boards.greenhouse.io/acme/2", description: "x", employer: "Acme Corp" };
  const row = (results: unknown[]) => ({ results, criteria: { country: "uk" }, searched_at: "2026-09-27T00:00:00.000Z" });

  it("returns everything when the person has not asked for direct employers", async () => {
    const stored = await getStoredSearch(clientReturning(row([board, direct])), "u1", false);
    expect(stored!.results).toHaveLength(2);
  });

  it("drops the board links from a row written before the toggle went on", async () => {
    /*
     * The whole point. No provider call and no re-search: the setting takes
     * effect on what is already stored, the moment they come back.
     */
    const stored = await getStoredSearch(clientReturning(row([board, direct])), "u1", true);
    expect(stored!.results.map((item) => item.url)).toEqual(["https://boards.greenhouse.io/acme/2"]);
  });

  it("answers null when nothing in the stored row survives the preference", async () => {
    /*
     * Null rather than an empty set, so the page treats it as no usable
     * stored search and runs a fresh one on arrival — the useful response to
     * "none of your saved roles are direct", rather than an explanation.
     */
    expect(await getStoredSearch(clientReturning(row([board])), "u1", true)).toBeNull();
  });

  it("answers null when there is no row at all", async () => {
    expect(await getStoredSearch(clientReturning(null), "u1", true)).toBeNull();
  });

  it("still drops rows it could not render either way", async () => {
    const stored = await getStoredSearch(
      clientReturning(row([
        direct,
        { title: "Dead end", url: "https://www.google.com/search?q=x", description: "", employer: "Acme Corp" },
        { title: "", url: "https://boards.greenhouse.io/acme/3", description: "", employer: "Acme Corp" },
      ])),
      "u1",
      true,
    );
    expect(stored!.results.map((item) => item.url)).toEqual(["https://boards.greenhouse.io/acme/2"]);
  });
});

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
