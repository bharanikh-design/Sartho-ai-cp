import { describe, expect, it } from "vitest";
import { dropSearchEnginePages, isSearchEnginePage, normaliseResults, rankApplicable } from "./run-search";
import { chooseApplyUrl, extractSerpApiJobs, keepScheduleTypes, mapSerpApiResult } from "./serpapi";

/*
 * Negative, adversarial and volume coverage for the job-sourcing path.
 *
 * The happy paths are covered beside each unit. This file is the other half:
 * what these functions do when handed the input a real provider actually sends
 * on a bad day — a missing field, a malformed link, an error dressed as a
 * success, five thousand apply routes — and what they must never do, which is
 * throw, hide everything, or send somebody to a search engine.
 */

const advert = {
  title: "ITSM Manager",
  company_name: "Acme",
  description: "Own the ITSM practice.",
};

describe("isSearchEnginePage — adversarial input", () => {
  it("never throws, and answers false, for anything that is not a usable URL", () => {
    const rubbish = [
      "", "   ", "not a url", "//", "http://", "https://",
      "javascript:alert(1)", "data:text/html,x", "/relative/path",
      "mailto:someone@example.com", "\u0000", "https://[",
    ];
    for (const value of rubbish) {
      expect(() => isSearchEnginePage(value), value).not.toThrow();
      expect(isSearchEnginePage(value), value).toBe(false);
    }
  });

  it("recognises a Google results page in any market and any casing", () => {
    for (const url of [
      "https://www.google.com/search?q=job",
      "https://google.com/search?q=job",
      "https://google.co.uk/search?q=job",
      "https://www.google.com.sg/search?q=x&ibp=htl;jobs",
      "HTTPS://WWW.GOOGLE.COM/search?q=x",
      "https://www.google.com/search",
    ]) {
      expect(isSearchEnginePage(url), url).toBe(true);
    }
  });

  /*
   * The filter removes destinations that are not an application. Google is
   * also an employer, and a board is allowed to have a /search route of its
   * own — neither is a Google results page.
   */
  it("does not mistake an employer or a real board for a search page", () => {
    for (const url of [
      "https://careers.google.com/jobs/results/123",
      "https://www.google.com/about/careers/",
      "https://www.mycareersfuture.gov.sg/search?q=itsm",
      "https://googlecareers.com/search?q=x",
      "https://notgoogle.com/search?q=x",
      "https://www.linkedin.com/jobs/view/1",
    ]) {
      expect(isSearchEnginePage(url), url).toBe(false);
    }
  });
});

describe("dropSearchEnginePages", () => {
  const job = (url: string) => ({ url });

  /*
   * The regression that survived three fixes. Each of those changed how a
   * destination is *chosen*; none of them reached this step, which ran only
   * for people who had switched "Direct employers only" on. With it off — the
   * default, and what most people have — a Google results page went straight
   * through to the screen and into the stored row.
   */
  it("removes them for everybody, with no toggle left to leave off", () => {
    const ranked = [job("https://www.google.com/search?q=x"), job("https://acme.com/1")];
    const { kept, hidden } = dropSearchEnginePages(ranked);
    expect(kept.map((item) => item.url)).toEqual(["https://acme.com/1"]);
    expect(hidden).toBe(1);
  });

  it("removes the search-engine dead ends and counts them", () => {
    const ranked = [
      job("https://www.google.com/search?q=a"),
      job("https://www.mycareersfuture.gov.sg/job/1"),
      job("https://google.co.uk/search?q=b"),
      job("https://acme.com/careers/2"),
    ];
    const { kept, hidden } = dropSearchEnginePages(ranked);
    expect(kept.map((item) => item.url)).toEqual([
      "https://www.mycareersfuture.gov.sg/job/1",
      "https://acme.com/careers/2",
    ]);
    expect(hidden).toBe(2);
  });

  /*
   * The exact inverse of what this used to promise, and the whole point of
   * the change.
   *
   * It stood down whenever removing everything would have emptied the page —
   * which is precisely the run where every single card leads back to a search
   * box. That was the second escape hatch, and it is why somebody with the
   * toggle ON could still be looking at a full page of Google links. An empty
   * list carrying a note that explains it beats a full page of dead ends.
   */
  it("empties the page rather than hand back a set of dead ends", () => {
    const ranked = [job("https://www.google.com/search?q=a"), job("https://google.com/search?q=b")];
    expect(dropSearchEnginePages(ranked)).toEqual({ kept: [], hidden: 2 });
  });

  it("is a no-op on an already empty result set", () => {
    expect(dropSearchEnginePages([])).toEqual({ kept: [], hidden: 0 });
  });

  it("leaves a page with nothing to remove exactly as it was", () => {
    const ranked = [job("https://acme.com/1"), job("https://careers.google.com/jobs/2")];
    expect(dropSearchEnginePages(ranked)).toEqual({ kept: ranked, hidden: 0 });
  });
});

/*
 * The live path and the stored path, held to one rule.
 *
 * `dropSearchEnginePages` decides what a run returns and writes;
 * `normaliseResults` decides what a stored row gives back. They sit a
 * thousand lines apart in the same file and were written months apart, which
 * is the shape of every bug this feature has had: a rule declared in one
 * place and assumed in another. Drift either way is a defect with a face —
 * too lenient on the write side and a dead end reaches somebody's screen, too
 * strict on the read side and a real vacancy vanishes from a stored search.
 *
 * This asserts they agree, not what they agree on. `/searchdirect` is in the
 * list for that reason: the prefix test arguably over-matches it, but the
 * cost of the two halves disagreeing is far higher than the cost of one
 * improbable path being judged harshly by both.
 */
describe("the live path and the stored path agree on what a dead end is", () => {
  const row = (url: string) => ({ title: "Reliability Engineer", url, description: "Ops." });

  for (const url of [
    "https://www.google.com/search?q=mechanical+engineer",
    "https://google.com/search?q=b",
    "https://google.co.uk/search?q=c",
    "https://www.google.com/searchdirect",
    "https://careers.google.com/jobs/results/1",
    "https://acme.com/careers/2",
    "https://www.mycareersfuture.gov.sg/job/1",
  ]) {
    it(`judges ${url} the same on the way out and the way back`, () => {
      const keptLive = dropSearchEnginePages([{ url }]).kept.length === 1;
      const keptStored = normaliseResults([row(url)]).length === 1;
      expect(keptStored, "stored path disagrees with the live path").toBe(keptLive);
    });
  }
});

/*
 * Removing dead ends and choosing the closest-role fallback, in that order.
 *
 * Both rules already existed; only their order was wrong, and the order was
 * the whole defect. The fallback is what stops the page being empty when
 * nothing in scope qualifies, so a removal that runs after it can empty a
 * page the fallback would have filled.
 */
describe("rankApplicable", () => {
  const match = (url: string, relevanceTier: "strong" | "possible" | "outside", overallMatch = 50) =>
    ({ url, relevanceTier, overallMatch });

  /*
   * The case that made this a function instead of three inline lines.
   *
   * Every in-scope match is a search-engine link and one out-of-scope match
   * is a real vacancy. Filtering last, `visible` is non-empty so the fallback
   * never runs, and then the filter takes all of `visible` away — leaving an
   * empty page with a usable job sitting unexamined in the set the fallback
   * declined to use.
   */
  it("keeps the closest-role fallback reachable when every in-scope match is a dead end", () => {
    const relevant = [
      match("https://www.google.com/search?q=a", "strong"),
      match("https://google.com/search?q=b", "possible"),
      match("https://acme.com/careers/real-job", "outside"),
    ];

    const { ranked } = rankApplicable(relevant);
    expect(ranked.map((item) => item.url)).toEqual(["https://acme.com/careers/real-job"]);
  });

  it("still prefers in-scope matches when any of them survive", () => {
    const relevant = [
      match("https://www.google.com/search?q=a", "strong"),
      match("https://acme.com/in-scope", "possible"),
      match("https://beta.com/out-of-scope", "outside"),
    ];

    const { ranked } = rankApplicable(relevant);
    expect(ranked.map((item) => item.url)).toEqual(["https://acme.com/in-scope"]);
  });

  /*
   * The count has to describe the page the person is looking at. Their
   * in-scope results are untouched here, and the dead ends were out-of-scope
   * listings that were never going to be shown — so reporting them as hidden
   * would describe a loss that did not happen.
   */
  it("does not report dead ends the person was never going to see", () => {
    const relevant = [
      match("https://acme.com/in-scope-1", "strong"),
      match("https://acme.com/in-scope-2", "possible"),
      match("https://www.google.com/search?q=x", "outside"),
      match("https://www.google.com/search?q=y", "outside"),
    ];

    const { ranked, hidden } = rankApplicable(relevant);
    expect(ranked).toHaveLength(2);
    expect(hidden, "out-of-scope dead ends are not a loss to report").toBe(0);
  });

  it("counts the dead ends that did cost the person results", () => {
    const relevant = [
      match("https://www.google.com/search?q=a", "strong"),
      match("https://www.google.com/search?q=b", "strong"),
      match("https://acme.com/in-scope", "possible"),
    ];

    const { ranked, hidden } = rankApplicable(relevant);
    expect(ranked.map((item) => item.url)).toEqual(["https://acme.com/in-scope"]);
    expect(hidden).toBe(2);
  });

  it("returns an empty page, honestly counted, when nothing at all can be applied to", () => {
    const relevant = [
      match("https://www.google.com/search?q=a", "strong"),
      match("https://google.co.uk/search?q=b", "outside"),
    ];

    expect(rankApplicable(relevant)).toEqual({ ranked: [], hidden: 2, jobBoardHidden: 0 });
  });

  it("is a no-op on an empty set", () => {
    expect(rankApplicable([])).toEqual({ ranked: [], hidden: 0, jobBoardHidden: 0 });
  });

  /*
   * The person's own source filter, counted the same careful way.
   *
   * It lives in here rather than beside the call so that both filters run
   * before the fallback chooses a tier, and so both counts can be taken
   * against the tier that was actually shown.
   */
  describe("with \u201cDirect employers only\u201d on", () => {
    const board = (tier: "strong" | "possible" | "outside") =>
      match("https://www.linkedin.com/jobs/view/" + Math.random(), tier);
    const direct = (tier: "strong" | "possible" | "outside") =>
      match("https://careers.acmecorp.com/" + Math.random(), tier);

    it("changes nothing when it is off", () => {
      const relevant = [board("strong"), direct("possible")];
      const { ranked, jobBoardHidden } = rankApplicable(relevant, false);
      expect(ranked).toHaveLength(2);
      expect(jobBoardHidden).toBe(0);
    });

    it("removes board listings and counts them when it is on", () => {
      const relevant = [board("strong"), direct("possible")];
      const { ranked, jobBoardHidden } = rankApplicable(relevant, true);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].url).toContain("careers.acmecorp.com");
      expect(jobBoardHidden).toBe(1);
    });

    /*
     * The miscount this was reported for. Ten board roles sitting out of
     * scope, one in-scope direct role surviving: the page would have claimed
     * ten listings hidden and offered a switch revealing none of them,
     * because the relevance fallback was never going to show those.
     */
    it("does not count board listings the fallback was never going to show", () => {
      const relevant = [direct("strong"), ...Array.from({ length: 10 }, () => board("outside"))];
      const { ranked, jobBoardHidden } = rankApplicable(relevant, true);
      expect(ranked).toHaveLength(1);
      expect(jobBoardHidden, "out-of-scope boards are not a loss to report").toBe(0);
    });

    it("does count them once the fallback is the tier being shown", () => {
      /* No in-scope match survives, so the out-of-scope set is what is on offer. */
      const relevant = [board("strong"), board("outside"), direct("outside")];
      const { ranked, jobBoardHidden } = rankApplicable(relevant, true);
      expect(ranked).toHaveLength(1);
      expect(jobBoardHidden).toBe(2);
    });

    it("keeps both counts adding up to what left the shown tier", () => {
      /*
       * Nothing may go unexplained: every listing missing from the page is
       * accounted for by one note or the other.
       */
      const relevant = [
        board("strong"),
        match("https://www.google.com/search?q=x", "strong"),
        direct("strong"),
      ];
      const { ranked, hidden, jobBoardHidden } = rankApplicable(relevant, true);
      expect(ranked).toHaveLength(1);
      expect(hidden).toBe(1);
      expect(jobBoardHidden).toBe(1);
      expect(hidden + jobBoardHidden + ranked.length).toBe(relevant.length);
    });
  });
});

describe("chooseApplyUrl — negative input", () => {
  it("returns null rather than a broken card when there is nowhere to send anybody", () => {
    expect(chooseApplyUrl({ ...advert })).toBeNull();
    expect(chooseApplyUrl({ ...advert, apply_options: [] })).toBeNull();
    expect(chooseApplyUrl({ ...advert, apply_options: [{}, { link: "" }, { link: "   " }] })).toBeNull();
  });

  it("never throws on a malformed apply link", () => {
    expect(() => chooseApplyUrl({ ...advert, apply_options: [{ link: "http://" }] })).not.toThrow();
    expect(() => chooseApplyUrl({ ...advert, company_name: "", apply_options: [{ link: "¬¬¬" }] })).not.toThrow();
  });

  it("still falls back to Google's listing page when that is genuinely all there is", () => {
    expect(chooseApplyUrl({ ...advert, share_link: "https://www.google.com/search?q=x" }))
      .toBe("https://www.google.com/search?q=x");
  });

  it("prefers the employer's own site above every board", () => {
    expect(chooseApplyUrl({
      ...advert,
      apply_options: [
        { title: "LinkedIn", link: "https://linkedin.com/jobs/1" },
        { title: "Acme", link: "https://acme.com/careers/1" },
      ],
      share_link: "https://www.google.com/search?q=x",
    })).toBe("https://acme.com/careers/1");
  });
});

describe("keepScheduleTypes — an advert that says nothing is never dropped", () => {
  const jobs = [
    { detected_extensions: { schedule_type: "Full-time" } },
    {},
    { detected_extensions: {} },
  ];

  it("keeps everything when nothing was asked for", () => {
    expect(keepScheduleTypes(jobs, [])).toHaveLength(3);
    expect(keepScheduleTypes(jobs, ["Nonexistent type"])).toHaveLength(3);
  });

  it("drops only the adverts that actively contradict the filter", () => {
    expect(keepScheduleTypes(jobs, ["Full-time"])).toHaveLength(3);
    expect(keepScheduleTypes(jobs, ["Internship"])).toHaveLength(2);
  });

  it("does not let a hyphen or a capital lose a job", () => {
    const hyphenated = [{ detected_extensions: { schedule_type: "FULL-TIME" } }];
    expect(keepScheduleTypes(hyphenated, ["Full-time"])).toHaveLength(1);
  });
});

describe("extractSerpApiJobs — a failure dressed as a success", () => {
  it("throws on a real refusal so an exhausted plan cannot look like an empty market", () => {
    expect(() => extractSerpApiJobs({ error: "Invalid API key" })).toThrow(/SerpApi/);
    expect(() => extractSerpApiJobs({ error: "Your account has run out of searches" })).toThrow(/SerpApi/);
  });

  it("treats an empty market as the answer it is", () => {
    expect(extractSerpApiJobs({ error: "Google hasn't returned any results for this query." })).toEqual([]);
  });

  it("never throws on a shape it did not expect", () => {
    for (const body of [null, undefined, "string", 42, [], {}, { jobs_results: "not an array" }]) {
      expect(() => extractSerpApiJobs(body), JSON.stringify(body) ?? "undefined").not.toThrow();
      expect(extractSerpApiJobs(body)).toEqual([]);
    }
  });
});

describe("mapSerpApiResult — records that cannot become a card", () => {
  it("drops them instead of rendering something broken", () => {
    expect(mapSerpApiResult(null as never)).toBeNull();
    expect(mapSerpApiResult(undefined as never)).toBeNull();
    expect(mapSerpApiResult("x" as never)).toBeNull();
    expect(mapSerpApiResult({})).toBeNull();
    expect(mapSerpApiResult({ title: "   ", description: "d", share_link: "https://x/1" })).toBeNull();
    expect(mapSerpApiResult({ title: "t", description: "   ", share_link: "https://x/1" })).toBeNull();
  });
});

/*
 * Volume. None of this path is algorithmically clever, and that is exactly why
 * it is worth pinning: a provider that returns a thousand records, or one
 * record carrying thousands of apply routes, must not turn a search into a
 * timeout.
 */
describe("stress", () => {
  it("picks the one real board out of five thousand apply routes, quickly", () => {
    const many = Array.from({ length: 5_000 }, (_, index) => ({
      title: `Mirror ${index}`,
      link: `https://mirror${index}.example.net/job`,
    }));
    many.push({ title: "MyCareersFuture", link: "https://www.mycareersfuture.gov.sg/job/1" });

    const started = Date.now();
    expect(chooseApplyUrl({ ...advert, apply_options: many }))
      .toBe("https://www.mycareersfuture.gov.sg/job/1");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("filters ten thousand results without falling over", () => {
    const ranked = Array.from({ length: 10_000 }, (_, index) => ({
      url: index % 2 === 0
        ? `https://www.google.com/search?q=${index}`
        : `https://employer${index}.com/job`,
    }));

    const started = Date.now();
    const { kept, hidden } = dropSearchEnginePages(ranked);
    expect(kept).toHaveLength(5_000);
    expect(hidden).toBe(5_000);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("reads a very long advert without choking", () => {
    const huge = "ServiceNow ITSM delivery. ".repeat(20_000);
    const mapped = mapSerpApiResult({ ...advert, description: huge, share_link: "https://x/1" });
    expect(mapped?.description.length).toBeGreaterThan(100_000);
  });
});

/*
 * The third report of "View still goes to Google search", traced to two
 * separate places that each preferred a Google page over a real destination.
 */
describe("View never lands on a search engine", () => {
  it("JSearch drops a record with no apply route rather than inventing one", async () => {
    const { mapJSearchResult } = await import("@/lib/jobs/search-provider");
    /*
     * This used to become google.com/search?q=<title> <employer> job — a query
     * Sartho wrote itself, three lines under a comment calling that a broken
     * promise. A record with nothing to apply to is not a card.
     */
    expect(mapJSearchResult({
      job_title: "ITSM Manager",
      employer_name: "Acme",
      job_description: "Own the ITSM practice.",
    } as never)).toBeNull();
  });

  it("JSearch still maps a record that has a real apply link", async () => {
    const { mapJSearchResult } = await import("@/lib/jobs/search-provider");
    const mapped = mapJSearchResult({
      job_title: "ITSM Manager",
      employer_name: "Acme",
      job_description: "Own the ITSM practice.",
      job_apply_link: "https://acme.com/careers/1",
    } as never);
    expect(mapped?.url).toBe("https://acme.com/careers/1");
  });

  it("no mapper hands back a search page while a real link exists", async () => {
    const { mapSerpApiResult } = await import("@/lib/jobs/serpapi");
    const { mapJSearchResult } = await import("@/lib/jobs/search-provider");

    const serp = mapSerpApiResult({
      title: "ITSM Manager",
      company_name: "Acme",
      description: "Own the ITSM practice.",
      share_link: "https://www.google.com/search?q=acme",
      apply_options: [{ title: "Board", link: "https://vacatures.example.nl/12" }],
    });
    const jsearch = mapJSearchResult({
      job_title: "ITSM Manager",
      employer_name: "Acme",
      job_description: "Own the ITSM practice.",
      apply_options: [{ apply_link: "https://vacatures.example.nl/12" }],
    } as never);

    for (const mapped of [serp, jsearch]) {
      expect(mapped?.url, "mapped to a search page").not.toMatch(/google\.[a-z.]+\/search/);
      expect(mapped?.url).toBe("https://vacatures.example.nl/12");
    }
  });
});

/*
 * Found by Codex on the fix above, and introduced by it: ranking a real apply
 * link over Google's page meant a malformed one got ranked over it too, so
 * rubbish that used to be reachable only when an advert had no share_link
 * became reachable whenever it had one.
 */
describe("a View destination is always somewhere a browser can go", () => {
  const advertWithGoogle = {
    title: "ITSM Manager",
    company_name: "Acme",
    description: "Own the ITSM practice.",
    share_link: "https://www.google.com/search?q=acme",
  };

  for (const link of [
    "http://",
    "https://",
    "/relative/path",
    "¬¬¬",
    "not a url",
    "",
    "   ",
  ]) {
    it(`falls back to Google rather than serving ${JSON.stringify(link)}`, () => {
      expect(chooseApplyUrl({ ...advertWithGoogle, apply_options: [{ link }] }))
        .toBe("https://www.google.com/search?q=acme");
    });
  }

  /*
   * These parse as valid URLs and report no hostname, so a host check alone
   * lets them through — and both execute from an href on click. The scheme
   * allowlist is what stops them.
   */
  for (const link of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "mailto:someone@example.com",
  ]) {
    it(`never serves ${link.split(":")[0]}: from an advert`, () => {
      const chosen = chooseApplyUrl({ ...advertWithGoogle, apply_options: [{ link }] });
      expect(chosen).toBe("https://www.google.com/search?q=acme");
      expect(chosen).not.toContain(link);
    });
  }

  it("serves nothing at all when the rubbish is the only option", () => {
    /* No share_link either, so there is genuinely nowhere to send anybody. */
    expect(chooseApplyUrl({
      title: "ITSM Manager",
      company_name: "Acme",
      description: "Own the ITSM practice.",
      apply_options: [{ link: "javascript:alert(1)" }, { link: "http://" }],
    })).toBeNull();
  });

  it("still picks the real link when it sits beside rubbish", () => {
    expect(chooseApplyUrl({
      ...advertWithGoogle,
      apply_options: [{ link: "javascript:alert(1)" }, { link: "https://vacatures.example.nl/12" }],
    })).toBe("https://vacatures.example.nl/12");
  });
});

/*
 * Codex's second finding on this PR, and the subtler of the two: a URL that
 * passes validation and still breaks in the browser.
 *
 * `https:example.com/jobs/1` — no slashes — parses with hostname
 * "example.com", so a boolean check waves it through unchanged. The browser
 * then resolves that raw string against the document base, and because the
 * scheme matches the page's it is treated as relative:
 * https://sartho.app/example.com/jobs/1. Same origin, dead link, validated.
 */
describe("a validated destination is canonical, not just parseable", () => {
  const advert = {
    title: "ITSM Manager",
    company_name: "Somewhere",
    description: "Own the ITSM practice.",
  };
  /* Resolved against an https page, the way the results panel renders it. */
  const asBrowserReads = (href: string | null) => new URL(href ?? "", "https://sartho.app/").href;

  for (const [input, expected] of [
    ["https:example.com/jobs/1", "https://example.com/jobs/1"],
    ["https:/example.com/jobs/1", "https://example.com/jobs/1"],
    ["https://example.com/jobs/1", "https://example.com/jobs/1"],
    ["HTTPS://Example.COM/jobs/1", "https://example.com/jobs/1"],
  ]) {
    it(`stores ${JSON.stringify(input)} as something a browser reads the same way`, () => {
      const chosen = chooseApplyUrl({ ...advert, apply_options: [{ link: input }] });
      expect(chosen).toBe(expected);
      /* The assertion that actually matters: it does not become same-origin. */
      expect(asBrowserReads(chosen)).toBe(expected);
      expect(asBrowserReads(chosen)).not.toContain("sartho.app");
    });
  }

  it("canonicalises Google's own page too, since it is rendered the same way", () => {
    expect(chooseApplyUrl({ ...advert, share_link: "https:www.google.com/search?q=x" }))
      .toBe("https://www.google.com/search?q=x");
  });

  it("does not let a non-canonical form smuggle past the scheme check", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,x", "ftp:example.com/x"]) {
      expect(chooseApplyUrl({ ...advert, apply_options: [{ link }] }), link).toBeNull();
    }
  });
});

/*
 * Codex's third and fourth findings on this PR, both downstream consequences
 * of ranking a real apply link above Google's page rather than defects in the
 * ranking itself. Worth keeping together: each is a contract somewhere else in
 * the app that the mapper quietly stopped honouring.
 */
describe("a chosen destination honours the contracts around it", () => {
  const advert = {
    title: "ITSM Manager",
    company_name: "Somewhere",
    description: "Own the ITSM practice.",
    share_link: "https://www.google.com/search?q=acme",
  };

  it("never picks an http destination the save route would reject", () => {
    /*
     * app/api/jobs/schema.ts accepts sourceUrl only when it starts with
     * https://. Before the reordering an unrecognised http option lost to the
     * https share_link; afterwards it won, and "Save to pipeline" 400d every
     * time on that card. A card you cannot save is worse than one pointing at
     * Google's listing, so the mapper is held to the save route's contract.
     */
    expect(chooseApplyUrl({ ...advert, apply_options: [{ link: "http://jobs.example.org/1" }] }))
      .toBe("https://www.google.com/search?q=acme");
  });

  it("still prefers an https board over Google", () => {
    expect(chooseApplyUrl({ ...advert, apply_options: [{ link: "https://jobs.example.org/1" }] }))
      .toBe("https://jobs.example.org/1");
  });

  it("drops the card when http is genuinely the only option", () => {
    expect(chooseApplyUrl({
      title: "ITSM Manager",
      company_name: "Somewhere",
      description: "Own the ITSM practice.",
      apply_options: [{ link: "http://jobs.example.org/1" }],
    })).toBeNull();
  });
});

describe("canonicalising a URL does not re-alert a vacancy", () => {
  it("matches a stored URL against its canonical form", async () => {
    const { selectNewMatches } = await import("@/lib/notifications/match-alerts");
    const result = {
      title: "ITSM Manager", employer: "Acme", location: "Melbourne", url: "https://example.com/",
      salary: null, source: "Google for Jobs", overallMatch: 90, recommendation: "strong",
      matchedSkills: [],
    };

    /*
     * seen_job_matches holds what earlier runs wrote — uncanonicalised, so
     * "https://example.com" with no trailing slash. Compared as exact strings
     * that stops matching the moment the mapper returns parsed.href, and the
     * same vacancy is emailed twice against a once-ever promise.
     */
    expect(selectNewMatches([result as never], ["https://example.com"]), "no trailing slash").toEqual([]);
    expect(selectNewMatches([result as never], ["HTTPS://EXAMPLE.COM/"]), "host case folded").toEqual([]);
    expect(selectNewMatches([result as never], ["https://example.com/"]), "already canonical").toEqual([]);
  });

  it("leaves the scheme alone, because the data is canonical now", async () => {
    const { selectNewMatches } = await import("@/lib/notifications/match-alerts");
    /*
     * This asserted the opposite until 20260927003000_canonical_seen_job_matches
     * — that a legacy `http://` row matched the https form the mapper now
     * returns, because destinationKey folded the schemes together.
     *
     * The fold was doing the data's job. It also meant a host serving
     * different content per scheme would have had a genuine alert silently
     * suppressed, which is the worse failure even though it is much rarer.
     * The migration rewrites the stored rows to https, so the key can be exact
     * again and that suppression cannot happen.
     *
     * The corollary, asserted here so it is not a surprise: an http row that
     * the migration has NOT reached is a miss, and gets alerted once. That is
     * why the two ship together.
     */
    const result = {
      title: "ITSM Manager", employer: "Acme", location: "Melbourne",
      url: "https://jobs.example.com/42",
      salary: null, source: "Google for Jobs", overallMatch: 90, recommendation: "strong",
      matchedSkills: [],
    };
    expect(selectNewMatches([result as never], ["https://jobs.example.com/42"]), "migrated row").toEqual([]);
    expect(selectNewMatches([result as never], ["HTTPS://Jobs.Example.COM/42"]), "migrated, mixed case").toEqual([]);
    expect(selectNewMatches([result as never], ["http://jobs.example.com/42"]), "unmigrated row is a miss").toHaveLength(1);
  });

  it("still treats a different vacancy as new", () => {
    return import("@/lib/notifications/match-alerts").then(({ selectNewMatches }) => {
      const result = {
        title: "ITSM Manager", employer: "Acme", location: "Melbourne",
        url: "https://jobs.example.com/43",
        salary: null, source: "Google for Jobs", overallMatch: 90, recommendation: "strong",
        matchedSkills: [],
      };
      expect(selectNewMatches([result as never], ["https://jobs.example.com/42"])).toHaveLength(1);
    });
  });

  it("still alerts a genuinely new vacancy", () => {
    /* The guard must not swallow everything — a different URL is still new. */
    return import("@/lib/notifications/match-alerts").then(({ selectNewMatches }) => {
      const result = {
        title: "ITSM Manager", employer: "Acme", location: "Melbourne", url: "https://example.com/new",
        salary: null, source: "Google for Jobs", overallMatch: 90, recommendation: "strong",
        matchedSkills: [],
      };
      expect(selectNewMatches([result as never], ["https://example.com/"])).toHaveLength(1);
    });
  });
});

/*
 * The reason "View goes to Google" survived three fixes at the mapper: search
 * results are persisted. Every fix applied to how a result is chosen, and
 * nothing applied to the rows already written — so the platform kept serving
 * Google links until somebody ran a fresh search, which is not a fix a person
 * should have to be told about.
 */
describe("stored results never serve a search engine", () => {
  it("drops a stored row whose destination is a Google search", async () => {
    const { normaliseResults } = await import("@/lib/jobs/run-search");
    const row = (url: string) => ({ title: "ITSM Manager", url, employer: "Acme" });

    const kept = normaliseResults([
      row("https://www.google.com/search?q=itsm+manager"),
      row("https://google.com/search?q=x&ibp=htl;jobs"),
      row("https://jobs.example.com/42"),
    ]);

    expect(kept.map((r) => r.url)).toEqual(["https://jobs.example.com/42"]);
  });

  it("keeps careers.google.com, which is a direct employer", async () => {
    const { normaliseResults } = await import("@/lib/jobs/run-search");
    const kept = normaliseResults([
      { title: "SRE", url: "https://careers.google.com/jobs/results/123", employer: "Google" },
    ]);
    expect(kept).toHaveLength(1);
  });

  it("returns nothing rather than a page of dead links", async () => {
    /*
     * When every stored row is a search page the honest answer is an empty
     * stored search, which prompts a fresh one — not a list nobody can apply
     * through.
     */
    const { normaliseResults } = await import("@/lib/jobs/run-search");
    expect(normaliseResults([
      { title: "A", url: "https://www.google.com/search?q=a" },
      { title: "B", url: "https://www.google.com/search?q=b" },
    ])).toEqual([]);
  });
});
