import { describe, expect, it } from "vitest";
import { BULLET_PROPOSE_RULES, BULLET_REWRITE_RULES, inventedNumbersIn, unfilledBlanks } from "./bullet-rewrite";

/*
 * The one rule separating this from every résumé tool that will turn "analysed
 * a retail dataset" into "analysed a 2M-row dataset driving 15% margin
 * improvement". The model is told not to invent and is not trusted to have
 * obeyed.
 */
describe("inventedNumbersIn", () => {
  it("accepts figures the person actually supplied", () => {
    expect(inventedNumbersIn(
      "Analysed 40,000 rows of retail data over 6 weeks.",
      "Analysed a live retail dataset.",
      "about 40,000 rows, over 6 weeks",
    )).toEqual([]);
  });

  it("catches a figure that came from nowhere", () => {
    expect(inventedNumbersIn(
      "Analysed 2,000,000 rows, driving a 15% margin improvement.",
      "Analysed a live retail dataset.",
      "it was a big dataset",
    )).toEqual(["2,000,000", "15"]);
  });

  it("keeps a number already in the original bullet", () => {
    expect(inventedNumbersIn(
      "Collaborated within a 6-member team to refine the solution.",
      "Collaborated within a 6-member consulting team.",
      "we stress-tested it with a mentor",
    )).toEqual([]);
  });

  it("has nothing to say about a rewrite carrying no figures", () => {
    expect(inventedNumbersIn("Presented the recommendation to a panel.", "Presented to a panel.", "it went well"))
      .toEqual([]);
  });
});

describe("BULLET_REWRITE_RULES", () => {
  /* Both routes send this, so the instruction cannot drift between them. */
  it("forbids inventing, and forbids inflating what was given", () => {
    expect(BULLET_REWRITE_RULES).toMatch(/ONLY the supplied bullet and the supplied fact/);
    expect(BULLET_REWRITE_RULES).toMatch(/Do not exaggerate/);
  });
});

/*
 * Propose-first has to stay honest: the model goes first, but a quantity it
 * cannot know is a visible blank, never a plausible guess.
 */
describe("unfilledBlanks", () => {
  it("finds the blanks a proposal left for the person", () => {
    expect(unfilledBlanks("Delivered a [how many phases]-phase roadmap over [how many weeks]."))
      .toEqual(["[how many phases]", "[how many weeks]"]);
  });

  it("is empty once they are filled in", () => {
    expect(unfilledBlanks("Delivered a four-phase roadmap over six weeks.")).toEqual([]);
  });

  it("does not mistake ordinary brackets in prose for a blank", () => {
    expect(unfilledBlanks("Ran the workshop series.")).toEqual([]);
    expect(unfilledBlanks("Delivered a roadmap [\nacross lines]")).toEqual([]);
  });
});

describe("BULLET_PROPOSE_RULES", () => {
  it("forbids guessing and caps how much homework a draft may hand back", () => {
    expect(BULLET_PROPOSE_RULES).toMatch(/must never guess/);
    expect(BULLET_PROPOSE_RULES).toMatch(/square-bracketed blank/);
    expect(BULLET_PROPOSE_RULES).toMatch(/at most three blanks/);
  });
});
