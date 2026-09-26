import { describe, expect, it } from "vitest";
import { searchFilterNotes } from "@/lib/jobs/search-notes";

const ids = (value: Parameters<typeof searchFilterNotes>[0]) => searchFilterNotes(value).map((note) => note.id);
const text = (value: Parameters<typeof searchFilterNotes>[0]) => searchFilterNotes(value).map((note) => note.text).join(" ");

describe("searchFilterNotes", () => {
  it("says nothing when nothing was filtered", () => {
    /*
     * The important half. These counts are undefined on most runs, and a page
     * that prints "0 listings hidden" under every search is how people learn
     * to stop reading the line that matters.
     */
    expect(searchFilterNotes({})).toEqual([]);
    expect(searchFilterNotes(null)).toEqual([]);
    expect(searchFilterNotes(undefined)).toEqual([]);
    expect(searchFilterNotes({ agencyOrUnverifiedHidden: 0, workModelHidden: 0, providerErrors: [] })).toEqual([]);
  });

  it("reports adverts the direct-employers filter removed", () => {
    const notes = searchFilterNotes({ agencyOrUnverifiedHidden: 4 });
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("direct-employers");
    expect(notes[0].text).toContain("4 listings");
    expect(notes[0].text).toContain("Direct employers only");
  });

  it("reports adverts the work-model filter removed, and names the pattern", () => {
    const notes = searchFilterNotes({ workModelHidden: 2, workModels: ["Hybrid", "Remote"] });
    expect(notes[0].id).toBe("work-model");
    expect(notes[0].text).toContain("2 listings");
    expect(notes[0].text).toContain("Hybrid or Remote");
    /* The leniency is the part worth stating; it is why the count is not higher. */
    expect(notes[0].text).toMatch(/say nothing either way are kept/);
  });

  it("still reads sensibly when the pattern list is missing", () => {
    expect(text({ workModelHidden: 1 })).toContain("the pattern you chose");
  });

  it("gets the singular right", () => {
    expect(text({ agencyOrUnverifiedHidden: 1 })).toContain("1 listing hidden");
    expect(text({ agencyOrUnverifiedHidden: 2 })).toContain("2 listings hidden");
  });

  it("names providers that did not answer", () => {
    const notes = searchFilterNotes({ providerErrors: ["Adzuna", "JSearch"] });
    expect(notes[0].id).toBe("provider-trouble");
    expect(notes[0].text).toContain("Adzuna and JSearch");
    /*
     * Phrased as a limit on what is visible rather than as a failure. The
     * person cannot act on a provider outage; what they can act on is knowing
     * the list is shorter than the market.
     */
    expect(notes[0].text).toMatch(/more out there than you can see/);
  });

  it("puts the filters the person set before the one they did not", () => {
    /* They can switch their own toggles off; they cannot fix a provider. */
    expect(ids({ agencyOrUnverifiedHidden: 3, workModelHidden: 2, providerErrors: ["Adzuna"] }))
      .toEqual(["direct-employers", "work-model", "provider-trouble"]);
  });

  it("ignores counts that are not real numbers", () => {
    /*
     * These are read back out of a stored JSON column written by older runs,
     * so the shape is not guaranteed. A note claiming "NaN listings hidden" is
     * worse than no note.
     */
    expect(searchFilterNotes({ agencyOrUnverifiedHidden: Number.NaN })).toEqual([]);
    expect(searchFilterNotes({ workModelHidden: -3 })).toEqual([]);
    expect(searchFilterNotes({ agencyOrUnverifiedHidden: Number.POSITIVE_INFINITY })).toEqual([]);
    expect(text({ agencyOrUnverifiedHidden: 2.7 }), "a fraction of an advert is still an advert").toContain("2 listings");
  });

  it("ignores blank provider names rather than printing an empty one", () => {
    expect(searchFilterNotes({ providerErrors: ["", "   "] })).toEqual([]);
    expect(text({ providerErrors: ["", "Adzuna"] })).toContain("Adzuna did not answer");
  });
});
