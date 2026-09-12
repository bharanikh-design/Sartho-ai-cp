import { describe, expect, it } from "vitest";
import {
  FIRST_PERSON,
  LONG_BULLET_CHARS,
  PASSIVE_VOICE,
  RESUME_WRITING_RULES,
  UNVERIFIABLE_SELF_DESCRIPTION,
  WEAK_OPENER,
  openingVerb,
  overusedOpeners,
  reviewWriting,
  unverifiableClaimsIn,
} from "./writing";

describe("openers that report being near the work", () => {
  it.each([
    "Responsible for the migration programme",
    "Helped with the ITSM rollout",
    "Worked on incident triage",
    "Assisted with vendor selection",
    "Involved in the platform review",
    "Tasked with reducing backlog",
    "Duties included stakeholder reporting",
    "Supported the transition team",
  ])("catches %j", (bullet) => {
    expect(WEAK_OPENER.test(bullet)).toBe(true);
  });

  it.each([
    "Led the migration of 14 applications",
    "Cut incident volume across four business units",
    "Negotiated the vendor contract",
    "Rebuilt the release process",
    /* The rule is about the opener, not the word appearing anywhere. */
    "Rebuilt a process that had been worked on for two years",
  ])("leaves %j alone", (bullet) => {
    expect(WEAK_OPENER.test(bullet)).toBe(false);
  });
});

describe("the passive voice", () => {
  it("catches work held at a distance from the person", () => {
    expect(PASSIVE_VOICE.test("The migration was delivered ahead of schedule")).toBe(true);
  });

  /*
   * The -ed test alone misses every irregular participle, which is most of
   * how a senior career is written. This was a real gap in the check the ATS
   * panel has always used, not a new rule.
   */
  it.each([
    "Incident volume was cut by the new triage model",
    "The platform was built by an offshore team",
    "The programme was led from Singapore",
    "Three releases were overseen each quarter",
    "The backlog was brought under control",
  ])("catches the irregular participle in %j", (line) => {
    expect(PASSIVE_VOICE.test(line)).toBe(true);
  });

  it("leaves the active voice alone", () => {
    expect(PASSIVE_VOICE.test("Cut incident volume with a new triage model")).toBe(false);
  });
});

describe("claims no reader can check", () => {
  it("reads the phrase back as the person wrote it", () => {
    expect(unverifiableClaimsIn("A detail-oriented team player")).toEqual(["detail-oriented", "team player"]);
  });

  /* Somebody who writes "detail oriented" meant the hyphenated phrase. */
  it("treats a space like a hyphen", () => {
    expect(unverifiableClaimsIn("Detail oriented and hard working")).toHaveLength(2);
  });

  it("reports the longer phrase rather than the word inside it", () => {
    expect(unverifiableClaimsIn("Proven track record of delivery")).toEqual(["Proven track record"]);
  });

  it("does not report the same claim twice", () => {
    expect(unverifiableClaimsIn("A team player, and a team player again")).toEqual(["team player"]);
  });

  it("leaves a line that states what somebody did", () => {
    expect(unverifiableClaimsIn("Led an eleven-person team across three countries")).toEqual([]);
  });

  /*
   * The pattern is rebuilt per call. A /g regex carries lastIndex between
   * uses, so a shared one silently skips every other line — the same bug the
   * metric check in ats.ts carries a comment about.
   */
  it("gives the same answer when asked twice", () => {
    const line = "A results-driven self-starter";
    expect(unverifiableClaimsIn(line)).toEqual(unverifiableClaimsIn(line));
  });
});

describe("first person", () => {
  it("catches a line narrating the person", () => {
    expect(FIRST_PERSON.test("I led the migration")).toBe(true);
    expect(FIRST_PERSON.test("Led my team through the cutover")).toBe(true);
  });

  it("leaves a phrase alone", () => {
    expect(FIRST_PERSON.test("Led the migration of 14 applications")).toBe(false);
  });
});

describe("a vocabulary of one", () => {
  it("names the verb that opened too many lines", () => {
    const bullets = ["Managed the rollout", "Managed the vendors", "Managed the budget", "Cut cycle time"];
    expect(overusedOpeners(bullets, 2)).toEqual([{ verb: "managed", count: 3 }]);
  });

  it("allows a repeat that reads as a theme", () => {
    expect(overusedOpeners(["Led the rollout", "Led the vendors"], 2)).toEqual([]);
  });

  it("reads the opening word off a line", () => {
    expect(openingVerb("  Re-platformed the estate")).toBe("re-platformed");
    expect(openingVerb("")).toBe("");
  });
});

describe("reviewing a set of lines", () => {
  it("points at the line each finding is about", () => {
    const findings = reviewWriting([
      "Led the migration of 14 applications",
      "Responsible for vendor management",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "weak-opener", index: 1 });
  });

  it("reports every fault on one line rather than the first", () => {
    const kinds = reviewWriting(["Responsible for a detail-oriented review that was delivered by my team"]).map((f) => f.kind);
    expect(kinds).toContain("weak-opener");
    expect(kinds).toContain("passive");
    expect(kinds).toContain("unverifiable");
    expect(kinds).toContain("first-person");
  });

  it("calls a paragraph a paragraph", () => {
    const long = `Led ${"the migration of a very large estate ".repeat(12)}`;
    expect(long.length).toBeGreaterThan(LONG_BULLET_CHARS);
    expect(reviewWriting([long]).map((f) => f.kind)).toContain("long");
  });

  it("reads a line the same whether or not it carries a bullet marker", () => {
    expect(reviewWriting(["• Responsible for delivery"])[0]).toMatchObject({ kind: "weak-opener" });
  });

  it("says nothing about a line that is already right", () => {
    expect(reviewWriting(["Cut incident volume across four business units"])).toEqual([]);
  });

  it("ignores a blank line rather than counting it as a fault", () => {
    expect(reviewWriting(["", "   "])).toEqual([]);
  });
});

/*
 * The standard is sent to three routes as one string. If a rule leaves this
 * list it silently stops being asked for everywhere at once, which is the
 * failure the shared module exists to prevent.
 */
describe("what the model is told", () => {
  it("names the openers it must not use", () => {
    expect(RESUME_WRITING_RULES).toContain("responsible for");
    expect(RESUME_WRITING_RULES).toContain("active voice");
  });

  it("lists the claims from the same source the check reads", () => {
    expect(RESUME_WRITING_RULES).toContain(UNVERIFIABLE_SELF_DESCRIPTION[0]);
  });

  /*
   * The rule the user asked for by name. A figure is welcome where the
   * evidence has one and never demanded where it does not — the coach that
   * had one note per bullet, all of them "add a number", is what this stops.
   */
  it("does not demand a figure on every line", () => {
    expect(RESUME_WRITING_RULES).toContain("never invented where it does not");
    expect(RESUME_WRITING_RULES).toContain("strong without a percentage");
  });
});
