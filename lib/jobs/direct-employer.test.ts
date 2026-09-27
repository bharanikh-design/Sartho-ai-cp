import { describe, expect, it } from "vitest";
import {
  AGGREGATOR_BOARD_HOSTS,
  APPLICANT_TRACKING_HOSTS,
  employerOwnsHost,
  isAggregatorBoard,
  isDirectEmployerDestination,
  KNOWN_DESTINATION_HOSTS,
} from "./destination";
import { keepDirectEmployers } from "./run-search";

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

  it("keeps the ranking list a faithful concatenation of the two halves", () => {
    /*
     * `chooseApplyUrl` ranks on one list and does not care which half a host
     * came from, so the split must not change what it recognises. Asserted
     * on order as well as membership: the two drifting apart is how a rule
     * declared in one file ends up assumed in another.
     */
    expect(KNOWN_DESTINATION_HOSTS).toEqual([...AGGREGATOR_BOARD_HOSTS, ...APPLICANT_TRACKING_HOSTS]);
    expect(new Set(KNOWN_DESTINATION_HOSTS).size, "a host listed in both halves").toBe(
      KNOWN_DESTINATION_HOSTS.length,
    );
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
