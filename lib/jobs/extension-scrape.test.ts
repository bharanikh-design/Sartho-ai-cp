import { readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * The real extension/scrape.js, run against real page shapes.
 *
 * This file is the whole extension's load-bearing wall: everything downstream —
 * the score, the pipeline row, the dedupe — is only as good as what it read off
 * the page, and it is the one part that cannot be typechecked, because it runs
 * as a plain script injected into somebody else's tab.
 *
 * So it is executed here rather than reimplemented. The source is loaded from
 * disk and evaluated with a jsdom document, which means these tests fail if the
 * shipped file changes shape — including the trailing-IIFE contract that
 * chrome.scripting.executeScript depends on for its return value.
 */

const source = readFileSync(path.join(process.cwd(), "extension", "scrape.js"), "utf8");

type Scraped = {
  title: string;
  company: string;
  location: string;
  description: string;
  postedDate: string;
  applicants: string;
  hiringManager: string;
  readBy: string;
  url: string;
};

function scrape(html: string, url: string): Scraped {
  const dom = new JSDOM(html, { url });
  const { window } = dom;

  /*
   * jsdom has no layout, so it implements no innerText. The scraper uses it
   * deliberately — on a real page innerText is what a person can actually see,
   * which is why hidden markup does not end up in the description. textContent
   * is the closest stand-in a headless DOM can offer, and the difference is
   * exactly the visibility filtering these tests are not able to cover.
   */
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) { return this.textContent; },
  });

  /*
   * The file's value is its last statement, which is how executeScript returns
   * it. Bound to a const rather than returned directly: `return` followed by a
   * line break is a semicolon in JavaScript, and the file opens with a
   * multi-line comment.
   */
  const run = new Function("document", "location", `const __result = ${source}; return __result;`);
  return run(window.document, window.location) as Scraped;
}

const jobPosting = (extra: Record<string, unknown> = {}) => JSON.stringify({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Business Analyst",
  description: "<p>Shape the delivery roadmap.</p><ul><li>Run discovery workshops</li><li>Write requirements</li></ul>",
  datePosted: "2026-09-01",
  hiringOrganization: { "@type": "Organization", name: "Datacom" },
  jobLocation: {
    "@type": "Place",
    address: { "@type": "PostalAddress", addressLocality: "Sydney", addressRegion: "NSW", addressCountry: "AU" },
  },
  ...extra,
});

describe("the shipped scraper", () => {
  beforeAll(() => {
    /* If this ever fails, executeScript silently returns undefined in production. */
    expect(source.trimEnd().endsWith("})();")).toBe(true);
  });

  it("reads a job from structured data, which is what makes it work beyond LinkedIn", () => {
    const page = scrape(
      `<html><head><script type="application/ld+json">${jobPosting()}</script></head><body><p>unrelated</p></body></html>`,
      "https://careers.example.com/jobs/482",
    );

    expect(page.title).toBe("Business Analyst");
    expect(page.company).toBe("Datacom");
    expect(page.location).toBe("Sydney, NSW, AU");
    expect(page.postedDate).toBe("2026-09-01");
    expect(page.readBy).toBe("structured data");
    expect(page.url).toBe("https://careers.example.com/jobs/482");
  });

  /* The bullets are what the requirement reader splits the advert on. */
  it("keeps a bulleted list as separate lines rather than one run-on sentence", () => {
    const page = scrape(
      `<html><head><script type="application/ld+json">${jobPosting()}</script></head><body></body></html>`,
      "https://careers.example.com/jobs/482",
    );
    expect(page.description).toContain("Run discovery workshops");
    expect(page.description).toContain("Write requirements");
    expect(page.description.split("\n").length).toBeGreaterThan(2);
    /* And the markup itself never reaches the description. */
    expect(page.description).not.toContain("<li>");
    expect(page.description).not.toContain("<p>");
  });

  it("finds a posting nested inside an @graph", () => {
    const graph = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "WebSite", name: "Careers" }, JSON.parse(jobPosting())],
    });
    const page = scrape(
      `<html><head><script type="application/ld+json">${graph}</script></head><body></body></html>`,
      "https://careers.example.com/jobs/1",
    );
    expect(page.title).toBe("Business Analyst");
    expect(page.company).toBe("Datacom");
  });

  it("is not stopped by a malformed block sitting beside a good one", () => {
    const page = scrape(
      `<html><head>
         <script type="application/ld+json">{ not json at all }</script>
         <script type="application/ld+json">${jobPosting()}</script>
       </head><body></body></html>`,
      "https://careers.example.com/jobs/1",
    );
    expect(page.title).toBe("Business Analyst");
  });

  it("reads a remote posting that names no place", () => {
    const page = scrape(
      `<html><head><script type="application/ld+json">${jobPosting({ jobLocation: undefined, jobLocationType: "TELECOMMUTE" })}</script></head><body></body></html>`,
      "https://careers.example.com/jobs/1",
    );
    expect(page.location).toBe("Remote");
  });

  it("falls back to a board's own markup when there is no structured data", () => {
    const page = scrape(
      `<html><body>
         <h1 data-testid="jobsearch-JobInfoHeader-title">Data Analyst</h1>
         <div data-testid="inlineHeader-companyName">Atlassian</div>
         <div data-testid="inlineHeader-companyLocation">Melbourne VIC</div>
         <div id="jobDescriptionText">You will build dashboards and work with stakeholders across the business.</div>
       </body></html>`,
      "https://au.indeed.com/viewjob?jk=abc123",
    );

    expect(page.title).toBe("Data Analyst");
    expect(page.company).toBe("Atlassian");
    expect(page.location).toBe("Melbourne VIC");
    expect(page.description).toContain("dashboards");
    expect(page.readBy).toBe("the Indeed page");
  });

  /*
   * Structured data routinely names the role and omits the location; the page
   * shows it plainly. The second strategy fills the gap rather than replacing
   * a good read with a worse one.
   */
  it("lets the page fill in what the structured data left out", () => {
    const page = scrape(
      `<html><head><script type="application/ld+json">${jobPosting({ jobLocation: undefined })}</script></head>
       <body><div data-testid="inlineHeader-companyLocation">Melbourne VIC</div></body></html>`,
      "https://au.indeed.com/viewjob?jk=abc123",
    );
    expect(page.title).toBe("Business Analyst");
    expect(page.location).toBe("Melbourne VIC");
    /* The better description won. */
    expect(page.readBy).toBe("structured data");
  });

  it("falls back to the page text on a site that publishes neither", () => {
    const page = scrape(
      `<html><body><main><h1>Product Owner</h1><p>We need someone to own the backlog and work with engineering.</p></main></body></html>`,
      "https://tiny-startup.example/careers/po",
    );
    expect(page.title).toBe("Product Owner");
    expect(page.description).toContain("own the backlog");
    expect(page.readBy).toBe("the page text");
  });

  it("returns a usable shape rather than throwing on a page with nothing on it", () => {
    const page = scrape("<html><body></body></html>", "https://example.com/");
    expect(typeof page.title).toBe("string");
    expect(typeof page.description).toBe("string");
    expect(page.url).toBe("https://example.com/");
  });

  it("reads LinkedIn's applicant count from the header without walking the whole page", () => {
    const page = scrape(
      `<html><body><main>
         <div class="job-details-jobs-unified-top-card__primary-description-container">
           <span>Sydney, NSW</span><span>Over 200 applicants</span>
         </div>
         <div id="job-details">Own the analysis for a large transformation programme across several teams.</div>
       </main></body></html>`,
      "https://www.linkedin.com/jobs/view/4012345678/",
    );
    expect(page.applicants).toBe("Over 200 applicants");
  });

  it("caps a runaway description instead of posting a whole site into the pipeline", () => {
    const huge = "word ".repeat(20_000);
    const page = scrape(
      `<html><body><main><h1>Analyst</h1><p>${huge}</p></main></body></html>`,
      "https://example.com/jobs/1",
    );
    expect(page.description.length).toBeLessThanOrEqual(24_000);
  });
});
