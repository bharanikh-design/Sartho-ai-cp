import { describe, expect, it } from "vitest";
import { EMPLOYMENT_TYPES, adzunaEmploymentParams, canFilter, earlyCareerSelections, employmentQueryHints, employmentType, filterableSelections, isEmploymentType, jsearchEmploymentTypes, narrowsResults, serpapiScheduleWords } from "./employment-types";

describe("employment types", () => {
  it("reaches each provider in that provider's own language", () => {
    expect(jsearchEmploymentTypes(["Full-time", "Contract"])).toBe("FULLTIME,CONTRACTOR");
    expect(adzunaEmploymentParams(["Full-time", "Part-time"])).toEqual(["full_time", "part_time"]);
  });

  /*
   * Hints used to be computed "where neither provider can filter", which threw
   * selections away: Internship has a JSearch filter, so it was excluded from
   * the hints — and on an Adzuna-only search, which is what actually runs,
   * Adzuna has no internship parameter and never saw the word either.
   */
  it("hints for what THIS provider cannot filter", () => {
    expect(employmentQueryHints(["Internship"], "adzuna")).toEqual(["internship"]);
    expect(employmentQueryHints(["Internship"], "jsearch")).toEqual([]);
    expect(employmentQueryHints(["Permanent"], "adzuna")).toEqual([]);
    expect(employmentQueryHints(["Permanent"], "jsearch")).toEqual(["permanent"]);
    expect(employmentQueryHints(["Graduate programme"], "adzuna")).toEqual(["graduate program"]);
    expect(employmentQueryHints(["Graduate programme"], "jsearch")).toEqual(["graduate program"]);
  });

  it("names the early-career selections that need their own pass", () => {
    expect(earlyCareerSelections(["Full-time", "Internship", "Graduate programme"]))
      .toEqual(["Internship", "Graduate programme"]);
    expect(earlyCareerSelections(["Full-time", "Permanent"])).toEqual([]);
  });

  it("sends nothing when nothing is chosen", () => {
    expect(jsearchEmploymentTypes([])).toBeNull();
    expect(adzunaEmploymentParams([])).toEqual([]);
    expect(employmentQueryHints([], "adzuna")).toEqual([]);
  });

  it("rejects a type it does not know", () => {
    expect(isEmploymentType("Full-time")).toBe(true);
    expect(isEmploymentType("Whenever I feel like it")).toBe(false);
  });

  it("omits mutually exclusive contract and permanent flags to prevent Adzuna 400", () => {
    expect(adzunaEmploymentParams(["Contract", "Permanent"])).toEqual([]);
    expect(adzunaEmploymentParams(["Full-time", "Contract", "Permanent"])).toEqual(["full_time"]);
    expect(adzunaEmploymentParams(["Contract"])).toEqual(["contract"]);
    expect(adzunaEmploymentParams(["Permanent"])).toEqual(["permanent"]);
  });
});

/*
 * SerpApi cannot ask Google to filter employment type, and the claim that it
 * could cost a whole search: a hand-built `employment_type:FULLTIME` chip
 * returned nothing from Google on every filtered search, while the unfiltered
 * probe kept reporting the provider healthy.
 *
 * Two assertions in here have been corrected rather than kept, because they
 * described the consequence of a bug:
 *
 *   - `employmentQueryHints(..., "serpapi")` returned the words. Nothing in
 *     production ever asked it for them — search-provider.ts only ever passes
 *     "adzuna" — so this locked in a landmine rather than a behaviour. Putting
 *     "full time" into a SerpApi query is the *other* way this search has been
 *     killed: Google matches every term added, so the words come back with
 *     nothing. It now refuses, by a guard rather than by luck.
 *
 *   - `filterableSelections(..., "serpapi")` returned nothing, so the brief
 *     told people every selection was a hint. keepScheduleTypes was filtering
 *     on all of them the whole time. The report was not merely incomplete, it
 *     was backwards, and this test was holding it that way.
 */
describe("what SerpApi can actually narrow", () => {
  const fullTime = employmentType("Full-time")!;
  const internship = employmentType("Internship")!;

  it("never claims Google will filter it for us", () => {
    /* Unchanged, and still the point: there is no request parameter to use. */
    for (const type of EMPLOYMENT_TYPES) {
      expect(canFilter(type, "serpapi")).toBe(false);
    }
  });

  it("puts no employment words into the query", () => {
    expect(employmentQueryHints(["Full-time", "Internship"], "serpapi")).toEqual([]);
    for (const type of EMPLOYMENT_TYPES) {
      expect(employmentQueryHints([type.id], "serpapi"), type.id).toEqual([]);
    }
  });

  it("narrows on every type after the results instead", () => {
    for (const type of EMPLOYMENT_TYPES) {
      expect(narrowsResults(type, "serpapi"), type.id).toBe(true);
    }
  });

  it("reports those selections as filtered, because they were", () => {
    expect(filterableSelections(["Full-time", "Contract"], "serpapi")).toEqual(["Full-time", "Contract"]);
  });

  /* The other two are unchanged: this was a SerpApi mistake, not a shared one. */
  it("leaves Adzuna and JSearch filtering as they were", () => {
    expect(canFilter(fullTime, "adzuna")).toBe(true);
    expect(canFilter(fullTime, "jsearch")).toBe(true);
    expect(canFilter(internship, "jsearch")).toBe(true);
    expect(canFilter(internship, "adzuna")).toBe(false);
    expect(narrowsResults(internship, "adzuna")).toBe(false);
    expect(narrowsResults(fullTime, "adzuna")).toBe(true);
  });
});

/*
 * serpapi.ts used to declare the schedule vocabulary itself while the report
 * of what got filtered read canFilter over here — two facts about one filter,
 * with nothing holding them together. This is the guard on the single table
 * that replaced them.
 */
describe("the schedule vocabulary", () => {
  it("covers every employment type, so none is silently unfilterable", () => {
    for (const type of EMPLOYMENT_TYPES) {
      expect(type.serpapiSchedule?.length, `${type.id} has no schedule words`).toBeTruthy();
    }
  });

  it("gathers the words for a selection without duplicating them", () => {
    /* Full-time and Permanent overlap on "permanent" and "fulltime". */
    const words = serpapiScheduleWords(["Full-time", "Permanent"]);
    expect(new Set(words).size).toBe(words.length);
    expect(words).toContain("full time");
    expect(words).toContain("permanent");
  });

  it("returns nothing for a selection it does not know", () => {
    expect(serpapiScheduleWords(["Whenever I feel like it"])).toEqual([]);
    expect(serpapiScheduleWords([])).toEqual([]);
  });
});

/*
 * Adzuna 400s on contract=1 and permanent=1 together, so adzunaEmploymentParams
 * drops the pair. Reported per selection, that told somebody two filters were
 * applied while the request carried neither.
 */
describe("what Adzuna actually narrowed on", () => {
  it("reports a selection only when its flag is really sent", () => {
    expect(adzunaEmploymentParams(["Contract", "Permanent"])).toEqual([]);
    expect(filterableSelections(["Contract", "Permanent"], "adzuna")).toEqual([]);
  });

  it("still reports the ones that are sent", () => {
    expect(filterableSelections(["Full-time", "Contract"], "adzuna")).toEqual(["Full-time", "Contract"]);
    expect(filterableSelections(["Full-time", "Contract", "Permanent"], "adzuna")).toEqual(["Full-time"]);
  });
});
