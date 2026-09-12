import { describe, expect, it } from "vitest";
import { MASTER_RESUME_RULES, MASTER_RESUME_SCHEMA, masterResumeOutput } from "./master";

/*
 * The rules are the product here. A résumé writer that only ever says "add a
 * number" is the complaint this was written against, so the things it must
 * also refuse are pinned rather than left to a prompt nobody re-reads.
 */
describe("master résumé rules", () => {
  const rules = MASTER_RESUME_RULES.toLowerCase();

  it("refuses the claims no reader can verify", () => {
    for (const phrase of [
      "results-driven", "detail-oriented", "team player", "passionate",
      "proven track record", "go-getter", "think outside the box", "synergy",
    ]) {
      expect(rules).toContain(phrase);
    }
  });

  it("bans the duty openers and asks for the active voice", () => {
    for (const phrase of ["responsible for", "helped with", "assisted with", "active voice"]) {
      expect(rules).toContain(phrase);
    }
  });

  /*
   * The correction that matters most: scope makes a line specific, and a figure
   * is one way to get there rather than the only one. "Led the rollout across
   * four business units" needs no percentage.
   */
  it("does not treat a missing number as the only weakness", () => {
    expect(rules).toContain("never invented");
    expect(rules).toContain("strong without a percentage");
  });

  it("asks for repetition, length and tense to be handled", () => {
    expect(rules).toContain("same verb");
    expect(rules).toContain("one or two lines");
    expect(rules).toContain("present tense");
  });

  it("keeps the invention guard the tailored draft already has", () => {
    expect(rules).toContain("never create or infer");
    expect(rules).toContain("cite at least one supplied evidence id");
  });
});

/*
 * OpenAI's strict structured outputs answer 400 to minItems and maxItems.
 * Sartho filters them now, but a schema that never needed filtering is one
 * fewer thing to go wrong.
 */
describe("master résumé schema", () => {
  it("carries no keyword strict mode would refuse", () => {
    const serialised = JSON.stringify(MASTER_RESUME_SCHEMA);
    for (const keyword of ["minItems", "maxItems", "minLength", "maxLength", "pattern", "format"]) {
      expect(serialised).not.toContain(keyword);
    }
  });

  it("parses a well-formed reply", () => {
    const parsed = masterResumeOutput.parse({
      headline: "ServiceNow Delivery Lead",
      professionalSummary: "Fifteen years delivering ITSM programmes.",
      experience: [{ roleId: "role-1", bullets: [{ text: "Led the rollout across four business units.", evidenceIds: ["e1"] }] }],
    });
    expect(parsed.experience[0].bullets[0].evidenceIds).toEqual(["e1"]);
  });

  /* The bounds the schema no longer states are enforced here instead. */
  it("rejects a reply with an empty headline or a blank bullet", () => {
    expect(() => masterResumeOutput.parse({ headline: "  ", professionalSummary: "x", experience: [] })).toThrow();
    expect(() => masterResumeOutput.parse({
      headline: "Lead",
      professionalSummary: "x",
      experience: [{ roleId: "r", bullets: [{ text: "   ", evidenceIds: ["e"] }] }],
    })).toThrow();
  });
});
