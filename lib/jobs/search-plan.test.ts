import { describe, expect, it } from "vitest";
import { planSearchQueries, sanitiseProviderKeywords, toSearchKeywords, widenToCountry } from "@/lib/jobs/search-plan";

describe("toSearchKeywords", () => {
  it("reduces a person's phrasing to the primary title", () => {
    expect(toSearchKeywords("Business Analyst / Junior Consultant")).toBe("Business Analyst");
    expect(toSearchKeywords("Senior Product Manager Payments Platform Lead")).toBe("Product Manager");
  });

  /*
   * This assertion used to read "Risk Cybersecurity Analyst" — the composite
   * verbatim. No employer posts that, so the provider returned almost nothing,
   * and a three-role search came back with two survivors. The real title inside
   * the phrase is what gets searched now.
   */
  it("searches the market title inside a composite, not the composite", () => {
    expect(toSearchKeywords("Risk & Cybersecurity Analyst (Graduate)")).toBe("Cybersecurity Analyst");
    expect(toSearchKeywords("Strategy Operations Analyst")).toBe("Operations Analyst");
    expect(toSearchKeywords("Management Consultant")).toBe("Management Consultant");
  });

  it("falls back to trimming when no market title is recognisable", () => {
    expect(toSearchKeywords("Chief Vibes Officer (Remote)")).toBe("Chief Vibes Officer");
  });
});

describe("planSearchQueries", () => {
  const brief = {
    roles: ["Business Analyst / Junior Consultant", "Data Analyst", "Risk Analyst", "Fourth Role"],
    country: "au",
    locations: ["Sydney", "Melbourne", "Brisbane"],
    companies: ["PwC", "Deloitte", "KPMG", "Accenture", "BCG"],
    remotePreferences: ["Hybrid"],
  };

  it("scopes every query to the person's country", () => {
    const queries = planSearchQueries(brief);
    expect(queries.every((query) => query.country === "au")).toBe(true);
  });

  it("searches the top role in the first two cities and every other role in the first", () => {
    const roleQueries = planSearchQueries(brief).filter((query) => !query.employer);
    expect(roleQueries.map((query) => [query.keywords, query.location])).toEqual([
      ["Business Analyst", "Sydney"],
      ["Business Analyst", "Melbourne"],
      ["Data Analyst", "Sydney"],
      ["Risk Analyst", "Sydney"],
      ["Fourth Role", "Sydney"],
    ]);
  });

  /*
   * This used to assert a cap of four employers against the top role only. Nine
   * selected employers meant five were never queried, and the criteria line
   * still read "companies: PwC, KPMG, Deloitte, EY" as if that were the list.
   */
  it("searches every employer against every saved role, country-wide", () => {
    const companyQueries = planSearchQueries(brief).filter((query) => query.employer);
    expect([...new Set(companyQueries.map((query) => query.employer))])
      .toEqual(["PwC", "Deloitte", "KPMG", "Accenture", "BCG"]);
    expect([...new Set(companyQueries.map((query) => query.keywords))])
      .toEqual(["Business Analyst", "Data Analyst", "Risk Analyst", "Fourth Role"]);
    expect(companyQueries.every((query) => query.location === undefined)).toBe(true);
  });

  /*
   * Adzuna ANDs full_time and permanent, which excludes exactly the internships
   * and graduate programmes selected beside them. Those get their own pass with
   * the conflicting flags dropped.
   */
  it("adds an early-career pass when internships or graduate roles are wanted", () => {
    const withEarly = planSearchQueries({
      ...brief,
      companies: [],
      employmentTypes: ["Full-time", "Permanent", "Internship", "Graduate programme"],
    });
    const early = withEarly.filter((query) => query.earlyCareerOnly);
    expect(early.map((query) => query.keywords)).toEqual(["Business Analyst", "Data Analyst", "Risk Analyst", "Fourth Role"]);

    const withoutEarly = planSearchQueries({
      ...brief,
      companies: [],
      employmentTypes: ["Full-time", "Permanent"],
    });
    expect(withoutEarly.some((query) => query.earlyCareerOnly)).toBe(false);
  });

  /*
   * Type of work and years of experience are different questions, and requiring
   * the first to get graduate postings is a trap for exactly the person who
   * most needs them. Somebody in their first year gets the pass either way.
   */
  it("adds the early-career pass for a graduate who ticked no employment type", () => {
    const queries = planSearchQueries({
      ...brief,
      companies: [],
      employmentTypes: [],
      entryLevelTerms: ["graduate program", "entry level"],
    });
    const early = queries.filter((query) => query.earlyCareerOnly);
    expect(early.map((query) => query.keywords)).toEqual(["Business Analyst", "Data Analyst", "Risk Analyst", "Fourth Role"]);
    expect(early[0].entryLevelTerms).toEqual(["graduate program", "entry level"]);
  });

  it("adds early-career cohort queries for target companies", () => {
    const queries = planSearchQueries({
      ...brief,
      entryLevelTerms: ["graduate program", "vacationer"],
    });
    const earlyCompanyQueries = queries.filter((q) => q.earlyCareerOnly && q.employer);
    expect(earlyCompanyQueries.map((q) => q.employer)).toEqual(["PwC", "Deloitte", "KPMG", "Accenture", "BCG"]);
    expect(earlyCompanyQueries.every((q) => q.keywords === "graduate program")).toBe(true);
  });

  it("does not add the pass for somebody who is not early career", () => {
    const queries = planSearchQueries({ ...brief, companies: [], employmentTypes: [], entryLevelTerms: [] });
    expect(queries.some((query) => query.earlyCareerOnly)).toBe(false);
  });

  it("searches the whole country when no city is set", () => {
    const queries = planSearchQueries({ ...brief, locations: [], companies: [] });
    expect(queries).toHaveLength(4);
    expect(queries.every((query) => query.location === undefined)).toBe(true);
  });

  it("asks for remote-only listings when the work model is Remote", () => {
    expect(planSearchQueries({ ...brief, remotePreferences: ["Remote"] }).every((query) => query.remoteOnly)).toBe(true);
    expect(planSearchQueries(brief).some((query) => query.remoteOnly)).toBe(false);
  });

  it("plans nothing without a target role", () => {
    expect(planSearchQueries({ ...brief, roles: [] })).toEqual([]);
  });
});

describe("widenToCountry", () => {
  it("re-runs each role once with no city and leaves company queries alone", () => {
    const widened = widenToCountry(planSearchQueries({
      roles: ["Business Analyst", "Data Analyst"],
      country: "au",
      locations: ["Sydney", "Melbourne"],
      companies: ["PwC"],
      remotePreferences: ["Flexible"],
    }));
    expect(widened.map((query) => query.keywords)).toEqual(["Business Analyst", "Data Analyst"]);
    expect(widened.every((query) => query.location === undefined && !query.employer && query.country === "au")).toBe(true);
  });

  it("has nothing to widen when the brief was already nationwide", () => {
    expect(widenToCountry(planSearchQueries({ roles: ["BA"], country: "in", locations: [], companies: [], remotePreferences: [] }))).toEqual([]);
  });
});

/*
 * The bug these exist for: the planner asked a model for Boolean search syntax
 * and handed it to two providers that parse none. Adzuna ANDs every term in
 * `what`, so `(Engagement Manager OR Delivery Director) -(Junior OR Associate)`
 * demanded an advert containing the literal words "OR", "Junior" and
 * "Associate" — no advert at all. A brief came back empty while both providers
 * answered normally, and nothing on screen said why.
 */
describe("provider keyword sanitising", () => {
  it("reduces a Boolean string to the plain title underneath it", () => {
    expect(sanitiseProviderKeywords("(Engagement Manager OR Delivery Director)"))
      .toBe("Engagement Manager Delivery Director");
  });

  /*
   * Negatives are removed, not unwrapped. Leaving the words behind would ask
   * for postings that DO say "Junior" — the exact opposite of the intent.
   */
  it("removes negative terms rather than turning them into demands", () => {
    const cleaned = sanitiseProviderKeywords(
      "ServiceNow Engagement Manager -(Junior OR Associate OR Assistant)",
    );
    expect(cleaned).toBe("ServiceNow Engagement Manager");
    expect(cleaned).not.toMatch(/junior|associate|assistant/i);
  });

  it("removes a bare negative term", () => {
    expect(sanitiseProviderKeywords("Practice Lead -Sales")).toBe("Practice Lead");
  });

  /*
   * Operators are stripped as whole words only. "Oracle" and "Android" are job
   * vocabulary, and a sanitiser that ate their first two letters would quietly
   * do more damage than the syntax it was cleaning up.
   */
  it("does not damage real words that contain an operator", () => {
    expect(sanitiseProviderKeywords("Oracle Android Engineer")).toBe("Oracle Android Engineer");
    expect(sanitiseProviderKeywords("Notary Andover Manager")).toBe("Notary Andover Manager");
  });

  it("keeps the punctuation that belongs in a job title", () => {
    expect(sanitiseProviderKeywords("C++ Developer")).toBe("C++ Developer");
    expect(sanitiseProviderKeywords("C# .NET Engineer")).toBe("C# .NET Engineer");
  });

  it("leaves an ordinary title untouched and survives nonsense", () => {
    expect(sanitiseProviderKeywords("Enterprise ITSM Practice Lead")).toBe("Enterprise ITSM Practice Lead");
    expect(sanitiseProviderKeywords("")).toBe("");
    expect(sanitiseProviderKeywords("-(AND OR NOT)")).toBe("");
  });
});

describe("model suggestions widen the search rather than replace it", () => {
  const brief = {
    roles: ["ServiceNow Senior Engagement Manager", "Enterprise ITSM Practice Lead"],
    country: "sg",
    locations: [],
    companies: [],
    remotePreferences: [],
    employmentTypes: ["Full-time"],
  };

  /*
   * The old behaviour swapped the deterministic titles out for the model's
   * string, so one bad generation threw away toSearchKeywords and the
   * market-title mapping and searched with strictly less than it would have
   * without any model at all.
   */
  it("always searches the person's own titles, whatever the model returns", () => {
    const keywords = planSearchQueries({
      ...brief,
      smartKeywords: ["(Delivery Director OR Programme Director)"],
    }).map((query) => query.keywords);

    expect(keywords).toContain("Engagement Manager");
    expect(keywords).toContain("Practice Lead");
  });

  it("adds the suggested titles alongside them, sanitised", () => {
    const keywords = planSearchQueries({
      ...brief,
      smartKeywords: ["Delivery Director", "-(Junior OR Associate)"],
    }).map((query) => query.keywords);

    expect(keywords).toContain("Delivery Director");
    // Nothing survives that one but negatives, so it must not become a query.
    expect(keywords.some((word) => /junior|associate/i.test(word))).toBe(false);
  });

  it("never sends Boolean syntax to a provider", () => {
    const keywords = planSearchQueries({
      ...brief,
      smartKeywords: ["(Engagement Manager OR Delivery Director) AND ServiceNow -(Junior)"],
    }).map((query) => query.keywords);

    for (const keyword of keywords) {
      expect(keyword).not.toMatch(/[()]|\bOR\b|\bAND\b|-\(/);
    }
  });

  it("produces at least as many queries as it would with no model at all", () => {
    const plain = planSearchQueries(brief).length;
    const widened = planSearchQueries({ ...brief, smartKeywords: ["Delivery Director"] }).length;
    expect(widened).toBeGreaterThanOrEqual(plain);
  });

  it("does not duplicate a suggestion that repeats a title already searched", () => {
    const keywords = planSearchQueries({
      ...brief,
      smartKeywords: ["Engagement Manager"],
    }).map((query) => query.keywords);

    expect(keywords.filter((word) => word === "Engagement Manager")).toHaveLength(1);
  });
});

/*
 * Order decides what actually runs, because the loop stops at a wall clock.
 * A brief naming four employers planned thirteen queries, ran four, and skipped
 * every employer the person had asked for by name — they sat last, behind
 * Sartho's own expansion of what their roles might also be called.
 */
describe("query order under a budget", () => {
  const brief = {
    roles: ["ServiceNow Engagement Manager", "Enterprise ITSM Practice Lead", "Delivery Director"],
    country: "sg",
    locations: [],
    companies: ["Accenture", "ServiceNow", "Deloitte", "KPMG"],
    remotePreferences: [],
    employmentTypes: ["Full-time"],
  };

  it("asks for every saved role before the named employers", () => {
    const queries = planSearchQueries(brief);
    const firstEmployer = queries.findIndex((query) => query.employer);
    const secondaryRole = queries.findIndex((query) => !query.employer && query.keywords !== queries[0].keywords);

    expect(firstEmployer).toBeGreaterThan(-1);
    expect(secondaryRole).toBeLessThan(firstEmployer);
  });

  /* The broadest query still leads — it is the one most likely to return anything. */
  it("still leads with the top role", () => {
    const queries = planSearchQueries(brief);
    expect(queries[0].employer).toBeUndefined();
  });

  it("asks for every employer the brief named", () => {
    const employers = planSearchQueries(brief).map((query) => query.employer).filter(Boolean);
    for (const name of brief.companies) expect(employers).toContain(name);
  });
});
