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
  confidence: "high" | "medium" | "low";
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

  /*
   * A LinkedIn feed post reported "successfully parsed (9790 chars)" and
   * offered to send somebody's personal story to the pipeline. It had parsed
   * perfectly; it was simply not a job. Length is not evidence of an advert.
   */
  describe("telling an advert from a page that merely has words on it", () => {
    const story = "<p>" + "Months ago I found myself torn between accepting a counteroffer and taking an external opportunity. ".repeat(40) + "</p>";

    it("refuses to call a LinkedIn feed post a job", () => {
      const page_ = scrape(`<html><body><main><h1>Feed</h1>${story}</main></body></html>`, "https://www.linkedin.com/feed/");
      expect(page_.confidence).toBe("low");
    });

    it("trusts structured data wherever it is found", () => {
      const page_ = scrape(
        `<html><head><script type="application/ld+json">${jobPosting()}</script></head><body>${story}</body></html>`,
        "https://example.com/anything",
      );
      expect(page_.confidence).toBe("high");
    });

    it("trusts a known board's own job markup", () => {
      const page_ = scrape(
        `<html><body><h1 data-testid="jobsearch-JobInfoHeader-title">Data Analyst</h1>`
        + `<div id="jobDescriptionText">You will build dashboards and work with stakeholders across the business every day.</div></body></html>`,
        "https://au.indeed.com/viewjob?jk=abc123",
      );
      expect(page_.confidence).toBe("high");
    });

    it("is cautious, not refusing, when the address looks like a job but the text came off the page", () => {
      const page_ = scrape(
        `<html><body><main><h1>Graduate Analyst</h1><p>We are hiring a graduate analyst to join our reporting team in Sydney this year.</p></main></body></html>`,
        "https://tiny-startup.example/careers/graduate-analyst",
      );
      expect(page_.confidence).toBe("medium");
    });
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

/*
 * The furniture of the page, as opposed to the advert on it.
 *
 * A real capture came back reading "121 school alumni work here", "Be an early
 * applicant" and "Posted 1 day ago" three times over, in the field Sartho
 * labels "the exact source used for every analysis and résumé decision". Every
 * requirement assessment and every résumé bullet is grounded in this text, so
 * chrome here is Sartho confidently analysing a navigation bar.
 */
describe("page chrome", () => {
  const linkedInPage = (body: string) => `
    <html><body><main>
      <h1 class="topcard__title">ServiceNow Delivery Director</h1>
      <a href="/company/acme" class="topcard__org-name-link">Acme</a>
      <div id="job-details">${body}</div>
    </main></body></html>
  `;

  it("drops the lines from the capture that started this", () => {
    const job = scrape(linkedInPage(`
      <p>About the job</p>
      <p>121 school alumni work here</p>
      <p>Be an early applicant</p>
      <p>Posted 1 day ago</p>
      <p>Lead ServiceNow delivery for enterprise clients across APAC.</p>
    `), "https://www.linkedin.com/jobs/view/4012345678/");

    expect(job.description).not.toMatch(/alumni work here/i);
    expect(job.description).not.toMatch(/early applicant/i);
    expect(job.description).not.toMatch(/Posted 1 day ago/i);
    expect(job.description).toContain("Lead ServiceNow delivery for enterprise clients across APAC.");
  });

  it("collapses the same line rendered three times over", () => {
    const job = scrape(linkedInPage(`
      <p>Posted 1 day ago</p>
      <p>Own the delivery roadmap.</p>
      <p>Own the delivery roadmap.</p>
      <p>Own the delivery roadmap.</p>
    `), "https://www.linkedin.com/jobs/view/1/");

    expect(job.description.match(/Own the delivery roadmap/g)).toHaveLength(1);
  });

  it("drops applicant counts and apply buttons", () => {
    const job = scrape(linkedInPage(`
      <p>Over 200 applicants</p>
      <p>Easy Apply</p>
      <p>Show more</p>
      <p>Actively recruiting</p>
      <p>Promoted by hirer</p>
      <p>Design the integration architecture.</p>
    `), "https://www.linkedin.com/jobs/view/1/");

    expect(job.description).toBe("Design the integration architecture.");
  });

  /*
   * The rule that matters more than the other one. Over-filtering deletes a
   * requirement, and a requirement Sartho cannot see is one it scores somebody
   * as not having.
   */
  it("never drops a requirement, however short", () => {
    const job = scrape(linkedInPage(`
      <p>5+ years of ServiceNow delivery</p>
      <p>ITIL v4 certified</p>
      <p>Remote team leadership across three time zones</p>
      <p>Apply Agile and SAFe at programme scale</p>
      <p>Contract negotiation with enterprise vendors</p>
      <p>Share knowledge across the practice</p>
    `), "https://www.linkedin.com/jobs/view/1/");

    expect(job.description).toContain("5+ years of ServiceNow delivery");
    expect(job.description).toContain("ITIL v4 certified");
    expect(job.description).toContain("Remote team leadership across three time zones");
    expect(job.description).toContain("Apply Agile and SAFe at programme scale");
    expect(job.description).toContain("Contract negotiation with enterprise vendors");
    expect(job.description).toContain("Share knowledge across the practice");
  });

  it("keeps a sentence that merely contains a chrome phrase", () => {
    const job = scrape(linkedInPage(`
      <p>You will be an early applicant reviewer, triaging the first sift each week.</p>
      <p>Reporting on how many applicants progressed past screening.</p>
    `), "https://www.linkedin.com/jobs/view/1/");

    /* Anchored patterns match a whole line, never a phrase inside one. */
    expect(job.description).toContain("early applicant reviewer");
    expect(job.description).toContain("how many applicants progressed");
  });

  it("keeps a repeated line that is long enough to be the advert's own doing", () => {
    const paragraph = "We are looking for somebody who can hold a room of executives and still write the detail up afterwards, every single week.";
    const job = scrape(linkedInPage(`<p>${paragraph}</p><p>${paragraph}</p>`), "https://www.linkedin.com/jobs/view/1/");
    expect(job.description.match(/hold a room of executives/g)).toHaveLength(2);
  });

  it("cleans the page-text fallback too, which is where most of it comes from", () => {
    const job = scrape(`
      <html><body><main>
        <h1>Engagement Manager</h1>
        <p>Posted 2 weeks ago</p>
        <p>Be among the first 25 applicants</p>
        <p>Full-time</p>
        <p>Run client engagements end to end.</p>
      </main></body></html>
    `, "https://careers.example.com/jobs/engagement-manager");

    expect(job.description).not.toMatch(/Posted 2 weeks ago/i);
    expect(job.description).not.toMatch(/first 25 applicants/i);
    expect(job.description).toContain("Run client engagements end to end.");
  });
});
