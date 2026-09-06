import { describe, expect, it } from "vitest";
import {
  bandForYears,
  entryLevelTermsFor,
  experienceBand,
  EXPERIENCE_BANDS,
  normaliseExperienceBand,
  yearsForExperienceFilter,
  yearsForSeniority,
} from "@/lib/jobs/experience";

describe("experience bands", () => {
  it("offers the four ranges and no others", () => {
    expect(EXPERIENCE_BANDS.map((band) => band.id)).toEqual(["0-1", "2-5", "5-10", "10+"]);
  });

  it("treats an unknown or absent value as nothing chosen", () => {
    expect(normaliseExperienceBand(null)).toBeNull();
    expect(normaliseExperienceBand("")).toBeNull();
    expect(normaliseExperienceBand("3-4")).toBeNull();
    expect(normaliseExperienceBand(5)).toBeNull();
    expect(experienceBand("nonsense")).toBeNull();
  });

  it("accepts a stored id", () => {
    expect(normaliseExperienceBand(" 5-10 ")).toBe("5-10");
    expect(experienceBand("10+")?.label).toBe("10+ years");
  });
});

/*
 * The labels have a gap between one year and two because those are the words
 * people recognise. The mapping must not — every year has to land somewhere.
 */
describe("bandForYears", () => {
  it("puts every year in a band", () => {
    expect(bandForYears(0)).toBe("0-1");
    expect(bandForYears(1)).toBe("0-1");
    expect(bandForYears(1.5)).toBe("0-1");
    expect(bandForYears(2)).toBe("2-5");
    expect(bandForYears(4.9)).toBe("2-5");
    expect(bandForYears(5)).toBe("5-10");
    expect(bandForYears(9)).toBe("5-10");
    expect(bandForYears(10)).toBe("10+");
    expect(bandForYears(30)).toBe("10+");
  });

  it("says nothing when the résumé gave no total", () => {
    expect(bandForYears(null)).toBeNull();
    expect(bandForYears(undefined)).toBeNull();
    expect(bandForYears(Number.NaN)).toBeNull();
    expect(bandForYears(-1)).toBeNull();
  });
});

/*
 * The two ends are used for opposite purposes, and getting them the wrong way
 * round is invisible until somebody is filtered out of their own level.
 */
describe("which end of the band gets used", () => {
  it("filters on the top, so fewer roles are removed when unsure", () => {
    expect(yearsForExperienceFilter(experienceBand("0-1")!)).toBe(1);
    expect(yearsForExperienceFilter(experienceBand("2-5")!)).toBe(5);
    expect(yearsForExperienceFilter(experienceBand("10+")!)).toBe(Number.POSITIVE_INFINITY);
  });

  it("judges seniority on the bottom, so an inflated title is tempered", () => {
    expect(yearsForSeniority(experienceBand("0-1")!)).toBe(0);
    expect(yearsForSeniority(experienceBand("2-5")!)).toBe(2);
    expect(yearsForSeniority(experienceBand("10+")!)).toBe(10);
  });

  it("marks only the first band as early career", () => {
    expect(EXPERIENCE_BANDS.filter((band) => band.earlyCareer).map((band) => band.id)).toEqual(["0-1"]);
  });
});

/*
 * Searching the wrong market's word for "just graduated" finds nothing, and
 * looks to the person like there is nothing there.
 */
describe("entryLevelTermsFor", () => {
  it("uses the phrase each market actually posts", () => {
    expect(entryLevelTermsFor("au")).toContain("graduate program");
    expect(entryLevelTermsFor("gb")).toContain("graduate scheme");
    expect(entryLevelTermsFor("in")).toContain("fresher");
    expect(entryLevelTermsFor("us")).toContain("new grad");
  });

  it("is case and whitespace tolerant, since codes arrive from storage", () => {
    expect(entryLevelTermsFor(" AU ")).toEqual(entryLevelTermsFor("au"));
  });

  it("still has something to search in a market with no entry", () => {
    expect(entryLevelTermsFor("de").length).toBeGreaterThan(0);
    expect(entryLevelTermsFor(null).length).toBeGreaterThan(0);
  });
});
