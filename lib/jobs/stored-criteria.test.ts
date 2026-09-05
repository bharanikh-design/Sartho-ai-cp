import { describe, expect, it } from "vitest";
import { normaliseCriteria } from "@/lib/jobs/run-search";

/*
 * The search_results row is JSON written by whatever version of run-search was
 * deployed at the time. Reading it back with a bare `as SearchCriteria` cast
 * satisfied TypeScript and did nothing at runtime, so the day employmentHinted
 * was added every earlier row lacked the key, the panel read
 * `criteria.employmentHinted.length`, and Find Roles died behind "That page did
 * not load cleanly".
 */
describe("normaliseCriteria", () => {
  it("fills the fields a row written before them cannot have", () => {
    const legacy = {
      country: "au",
      countries: ["au"],
      employmentTypes: ["Full-time"],
      candidateLevel: 1,
      tooSenior: 17,
      countryName: "Australia",
      countrySource: "brief",
      locations: ["Sydney"],
      broadened: false,
      companies: ["PwC"],
      roles: ["Business Analyst"],
      remoteOnly: false,
      providers: ["Adzuna"],
      queriesRun: 6,
      queriesSkipped: 0,
    };

    const criteria = normaliseCriteria(legacy);
    expect(criteria.employmentHinted).toEqual([]);
    expect(criteria.companiesRequested).toBe(0);
    expect(criteria.offFamily).toBe(0);
    expect(criteria.families).toEqual([]);
    /* And nothing the row did carry is lost. */
    expect(criteria.tooSenior).toBe(17);
    expect(criteria.companies).toEqual(["PwC"]);
    expect(criteria.countrySource).toBe("brief");
  });

  it("survives a row that is empty, null, or the wrong shape entirely", () => {
    for (const stored of [null, undefined, {}, [], "nonsense", 42]) {
      const criteria = normaliseCriteria(stored);
      expect(criteria.employmentHinted).toEqual([]);
      expect(criteria.roles).toEqual([]);
      expect(criteria.queriesRun).toBe(0);
      expect(criteria.countrySource).toBe("default");
    }
  });

  it("drops values of the wrong type rather than passing them through", () => {
    const criteria = normaliseCriteria({
      roles: ["Business Analyst", 7, null],
      tooSenior: "many",
      broadened: "yes",
      countrySource: "invented",
    });
    expect(criteria.roles).toEqual(["Business Analyst"]);
    expect(criteria.tooSenior).toBe(0);
    expect(criteria.broadened).toBe(false);
    expect(criteria.countrySource).toBe("default");
  });
});
