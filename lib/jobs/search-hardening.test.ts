import { describe, expect, it } from "vitest";
import { applyDirectEmployerFilter, isSearchEnginePage } from "./run-search";
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

describe("applyDirectEmployerFilter", () => {
  const job = (url: string) => ({ url });

  it("changes nothing at all when the toggle is off", () => {
    const ranked = [job("https://www.google.com/search?q=x"), job("https://acme.com/1")];
    expect(applyDirectEmployerFilter(ranked, false)).toEqual({ kept: ranked, hidden: 0 });
  });

  it("removes the search-engine dead ends and counts them", () => {
    const ranked = [
      job("https://www.google.com/search?q=a"),
      job("https://www.mycareersfuture.gov.sg/job/1"),
      job("https://google.co.uk/search?q=b"),
      job("https://acme.com/careers/2"),
    ];
    const { kept, hidden } = applyDirectEmployerFilter(ranked, true);
    expect(kept.map((item) => item.url)).toEqual([
      "https://www.mycareersfuture.gov.sg/job/1",
      "https://acme.com/careers/2",
    ]);
    expect(hidden).toBe(2);
  });

  /*
   * The promise not to hand back an empty page. A filter that removes
   * everything is worse than the reposts it removed, and it must not then
   * claim a hidden count for results it put straight back.
   */
  it("stands down rather than empty the page, and says it hid nothing", () => {
    const ranked = [job("https://www.google.com/search?q=a"), job("https://google.com/search?q=b")];
    expect(applyDirectEmployerFilter(ranked, true)).toEqual({ kept: ranked, hidden: 0 });
  });

  it("is a no-op on an already empty result set", () => {
    expect(applyDirectEmployerFilter([], true)).toEqual({ kept: [], hidden: 0 });
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
    const { kept, hidden } = applyDirectEmployerFilter(ranked, true);
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
