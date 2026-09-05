import { describe, expect, it } from "vitest";
import type { ScoredJobMatch, SearchCriteria } from "@/lib/jobs/run-search";
import { MAX_ALERT_MATCHES, renderMatchAlertEmail, selectNewMatches } from "./match-alerts";

function match(overrides: Partial<ScoredJobMatch>): ScoredJobMatch {
  return {
    title: "Business Analyst",
    employer: "PwC",
    location: "Sydney, NSW, AU",
    url: "https://example.com/1",
    salary: null,
    postedAt: null,
    source: "Google for Jobs",
    description: "Deliver analysis.",
    overallMatch: 60,
    recommendation: "review",
    matchedSkills: ["Stakeholder management"],
    titleFit: 80,
    requirementCoverage: 60,
    closestTitle: "Business Analyst",
    missingRequirements: [],
    ...overrides,
  };
}

const criteria: SearchCriteria = {
  country: "au",
  countryName: "Australia",
  countrySource: "brief",
  locations: ["Sydney"],
  broadened: false,
  companies: ["PwC"],
  roles: ["Business Analyst"],
  remoteOnly: false,
  providers: ["Google for Jobs"],
  queriesRun: 2,
  queriesSkipped: 0,
};

describe("selectNewMatches", () => {
  it("drops skips and anything already seen, best first", () => {
    const picked = selectNewMatches([
      match({ url: "https://example.com/seen", overallMatch: 90 }),
      match({ url: "https://example.com/skip", recommendation: "skip", overallMatch: 95 }),
      match({ url: "https://example.com/a", overallMatch: 50 }),
      match({ url: "https://example.com/b", title: "Data Analyst", overallMatch: 70, recommendation: "apply" }),
    ], ["https://example.com/seen"]);
    expect(picked.map((item) => item.url)).toEqual(["https://example.com/b", "https://example.com/a"]);
  });

  it("counts a repost with the same title and employer once", () => {
    const picked = selectNewMatches([
      match({ url: "https://example.com/1" }),
      match({ url: "https://example.com/2" }),
    ], []);
    expect(picked).toHaveLength(1);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, index) => match({ url: `https://example.com/${index}`, title: `Role ${index}` }));
    expect(selectNewMatches(many, [])).toHaveLength(MAX_ALERT_MATCHES);
  });
});

describe("renderMatchAlertEmail", () => {
  it("names the count and country in the subject and escapes user text", () => {
    const email = renderMatchAlertEmail({
      firstName: "<Bharani>",
      matches: selectNewMatches([match({ title: "Analyst <script>" })], []),
      criteria,
      appUrl: "https://sartho.tech",
    });
    expect(email.subject).toBe("1 new match in Australia · Sartho");
    expect(email.html).toContain("&lt;Bharani&gt;");
    expect(email.html).toContain("Analyst &lt;script&gt;");
    expect(email.html).toContain("Searched: Australia · Sydney · roles: Business Analyst · companies: PwC");
    expect(email.html).toContain("https://sartho.tech/search-plan#find-roles");
  });

  it("labels a test send as a test", () => {
    const email = renderMatchAlertEmail({ firstName: "B", matches: [], criteria, appUrl: "https://sartho.tech", isTest: true });
    expect(email.subject.startsWith("Test:")).toBe(true);
  });
});
