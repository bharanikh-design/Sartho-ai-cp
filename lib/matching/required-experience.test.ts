import { describe, expect, it } from "vitest";
import {
  demandsMoreExperience,
  requiredExperienceIn,
  type RequiredExperience,
} from "@/lib/matching/required-experience";

/*
 * These are written from real advert prose, because the failure mode this
 * module exists to prevent is not "misses a requirement" — it is "invents one".
 * A graduate wrongly filtered out of a role that never asked for experience is
 * a worse outcome than a senior role slipping through, and only the second is
 * visible to the person searching.
 */

describe("requiredExperienceIn", () => {
  it("reads the plain forms adverts actually use", () => {
    expect(requiredExperienceIn("5+ years of experience in data analysis").minYears).toBe(5);
    expect(requiredExperienceIn("Minimum of 3 years' experience required").minYears).toBe(3);
    expect(requiredExperienceIn("At least seven years of professional experience").minYears).toBe(7);
    expect(requiredExperienceIn("You will bring 8-10 years experience").minYears).toBe(8);
    expect(requiredExperienceIn("Experience: 4 yrs in a similar role").minYears).toBe(4);
    expect(requiredExperienceIn("More than 10 years of hands-on experience").minYears).toBe(10);
  });

  it("takes the lowest figure stated, not the first", () => {
    const read = requiredExperienceIn(
      "We are hiring across the team. The senior track asks for 8 years of experience; " +
      "for this posting 3 years of experience is enough.",
    );
    expect(read.minYears).toBe(3);
  });

  it("says nothing when the advert says nothing", () => {
    const read = requiredExperienceIn("Join a growing team. Competitive salary. Hybrid working.");
    expect(read.minYears).toBeNull();
    expect(read.evidence).toBeNull();
    expect(read.entryFriendly).toBe(false);
  });

  it("survives an empty description", () => {
    expect(requiredExperienceIn("")).toEqual({ minYears: null, evidence: null, entryFriendly: false });
  });

  /*
   * The whole reason the number has to sit near an experience word. Each of
   * these appears in ordinary adverts, and reading any of them as a requirement
   * hides roles a graduate could have had.
   */
  it("ignores years that are not about the applicant", () => {
    expect(requiredExperienceIn("We were founded 5 years ago in Melbourne.").minYears).toBeNull();
    expect(requiredExperienceIn("A 3 year degree in any discipline.").minYears).toBeNull();
    expect(requiredExperienceIn("5 years of double-digit growth across the region.").minYears).toBeNull();
    expect(requiredExperienceIn("This is a 2 year fixed-term contract.").minYears).toBeNull();
    expect(requiredExperienceIn("Our roadmap covers the next 3 years.").minYears).toBeNull();
  });

  it("reads a requirement written either side of the number", () => {
    expect(requiredExperienceIn("6 years of experience with SQL").minYears).toBe(6);
    expect(requiredExperienceIn("Experience required: 6 years").minYears).toBe(6);
    expect(requiredExperienceIn("An experienced professional with 6 years behind them").minYears).toBe(6);
  });

  it("quotes the phrase it read, so the working can be checked", () => {
    const read = requiredExperienceIn("We need at least 5 years of experience in consulting.");
    expect(read.evidence).toContain("5");
    expect(read.evidence?.toLowerCase()).toContain("years");
  });

  it("does not carry state between descriptions", () => {
    /* A /g regex reused across calls silently skips every other advert. */
    for (let i = 0; i < 4; i += 1) {
      expect(requiredExperienceIn("4 years of experience needed").minYears).toBe(4);
    }
  });

  it("discards a number too large to be a career", () => {
    expect(requiredExperienceIn("Serving customers for 75 years of experience in retail").minYears).toBeNull();
  });

  describe("adverts that welcome people starting out", () => {
    const friendly = [
      "No prior experience is required — we train you.",
      "Our 2026 Graduate Programme is now open.",
      "This is an entry-level position.",
      "A 12 week internship with a view to a permanent role.",
      "Freshers welcome to apply.",
      "We are looking for recent graduates from any discipline.",
      "Trainee Analyst — full training provided.",
      "Suitable for candidates with 0-2 years experience.",
    ];

    for (const text of friendly) {
      it(`flags: ${text.slice(0, 40)}…`, () => {
        expect(requiredExperienceIn(text).entryFriendly).toBe(true);
      });
    }

    it("does not flag an ordinary senior advert", () => {
      expect(requiredExperienceIn("Senior Manager with 9 years of experience leading teams").entryFriendly).toBe(false);
    });
  });
});

describe("demandsMoreExperience", () => {
  const read = (minYears: number | null, entryFriendly = false): RequiredExperience => ({
    minYears,
    evidence: minYears === null ? null : `${minYears} years`,
    entryFriendly,
  });

  it("keeps a role that never stated a requirement", () => {
    expect(demandsMoreExperience(read(null), 0)).toBe(false);
  });

  it("keeps the near miss, because requirements are a wish not a rule", () => {
    /* A graduate who never sees a role asking for two years is being
     * protected out of opportunities they would in fact have got. */
    expect(demandsMoreExperience(read(1), 0)).toBe(false);
    expect(demandsMoreExperience(read(2), 1)).toBe(false);
    expect(demandsMoreExperience(read(3), 2)).toBe(false);
  });

  it("removes the wall", () => {
    expect(demandsMoreExperience(read(5), 0)).toBe(true);
    expect(demandsMoreExperience(read(8), 2)).toBe(true);
    expect(demandsMoreExperience(read(10), 5)).toBe(true);
    expect(demandsMoreExperience(read(6), 5)).toBe(false);
  });

  it("keeps early career adverts within stretch but strictly filters out senior demands", () => {
    /* Within stretch for 0 years (0 + 1 = 1 year, or 2 years with stretch): kept */
    expect(demandsMoreExperience(read(1, true), 0)).toBe(false);
    expect(demandsMoreExperience(read(2, true), 0)).toBe(false);

    /* A 4-7 year or 9 year role stating experience strictly overrides soft words */
    expect(demandsMoreExperience(read(4, true), 0)).toBe(true);
    expect(demandsMoreExperience(read(7, true), 0)).toBe(true);
    expect(demandsMoreExperience(read(9, true), 0)).toBe(true);
  });

  describe("cross-market early career phrasings", () => {
    const globalPhrasings = [
      "PwC 2026 Graduate Program Sydney",
      "Deloitte Summer Vacationer Internship",
      "New Grad Software Engineer (US)",
      "Campus Hire Analyst 2025",
      "UK Graduate Scheme in Finance",
      "Fresher Trainee in Bangalore",
      "Fresh Graduate Development Program Dubai",
      "Werkstudent IT & Business Analytics",
      "Apprenticeship in Data Science",
    ];

    for (const text of globalPhrasings) {
      it(`recognises global term: ${text}`, () => {
        expect(requiredExperienceIn(text).entryFriendly).toBe(true);
      });
    }
  });
});
