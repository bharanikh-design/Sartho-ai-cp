import { describe, expect, it } from "vitest";
import { bulletsIn, scoreAts } from "./ats";
import type { RuleAnalysis } from "@/lib/types";

const analysis = (missing: string[], matched: string[]): RuleAnalysis => ({
  recommendation: "review",
  confidence: "medium",
  matchedSignals: matched,
  cautionSignals: [],
  missingRequirements: missing,
  explanation: "",
});

const draft = (body: string) => body.padEnd(2400, " requirement delivery experience");

describe("scoreAts", () => {
  /*
   * The distinction the whole file turns on. A strength the evidence supports
   * but the draft omits is a fix. A requirement the evidence cannot back is
   * not a keyword to add — suggesting it would be telling someone to lie.
   */
  it("separates strengths it can back from requirements it cannot", () => {
    const result = scoreAts(
      draft("Led business analysis across two releases."),
      analysis(["Cybersecurity"], ["Business analysis", "Agile delivery"]),
    );
    expect(result.unusedStrengths).toEqual(["Agile delivery"]);
    expect(result.unbackedRequirements).toEqual(["Cybersecurity"]);
    expect(result.unusedStrengths).not.toContain("Cybersecurity");
  });

  it("does not punish a draft for omitting what it cannot evidence", () => {
    const honest = analysis(["Cybersecurity", "Cloud & infrastructure"], ["Business analysis"]);
    const none = analysis([], ["Business analysis"]);
    const body = draft("Business analysis across two releases, cutting 30% of rework in 4 teams.");
    expect(scoreAts(body, honest).score).toBe(scoreAts(body, none).score);
  });

  it("counts quantified achievement, not any digit", () => {
    const result = scoreAts(draft("Cut cost by 42% and saved $1.2M across 11 countries."), analysis([], []));
    expect(result.metricsFound).toBeGreaterThanOrEqual(3);
  });

  it("names the bullets carrying no figure", () => {
    const result = scoreAts([
      "HEADLINE",
      "",
      "EXPERIENCE",
      "• Cut rework by 30% across two releases.",
      "• Analysed a live retail dataset to diagnose inefficiencies.",
      "• Designed decision logic for an automated tool.",
    ].join("\n"), analysis([], []));

    expect(result.weakBullets.map((bullet) => bullet.index)).toEqual([1, 2]);
    expect(result.weakBullets[0].text).toMatch(/live retail dataset/);
    expect(result.checks[1].detail).toMatch(/1 of 3 bullets carry a figure/);
  });

  /*
   * A /g regex keeps lastIndex between calls, so testing bullets with one
   * shared instance silently skips every other line.
   */
  it("judges each bullet independently", () => {
    const result = scoreAts([
      "• Delivered 4 releases.",
      "• Delivered 5 releases.",
      "• Delivered several releases.",
    ].join("\n"), analysis([], []));
    expect(result.weakBullets.map((bullet) => bullet.index)).toEqual([2]);
  });

  it("scores a draft that uses its evidence above one that does not", () => {
    const both = analysis([], ["Business analysis", "Agile delivery"]);
    const covered = scoreAts(draft("Business analysis and agile delivery every sprint, cutting 30% of rework."), both);
    const bare = scoreAts(draft("Did some work on things."), both);
    expect(covered.score).toBeGreaterThan(bare.score);
  });

  it("says plainly when there is no analysis to check against", () => {
    const result = scoreAts(draft("A draft with no role behind it."), null);
    expect(result.checks[0].detail).toMatch(/Run the role analysis/);
  });

  it("flags an empty draft rather than scoring it", () => {
    const result = scoreAts("", analysis([], []));
    expect(result.wordCount).toBe(0);
    expect(result.checks[2].state).toBe("fail");
  });
});

describe("bulletsIn", () => {
  it("reads the bullet lines and nothing else", () => {
    expect(bulletsIn([
      "Business Analyst | Strategy",
      "",
      "PROFESSIONAL SUMMARY",
      "Analytical and solutions-focused.",
      "",
      "EXPERIENCE",
      "• Delivered an implementation roadmap.",
      "•   Designed a phased rollout strategy.",
    ].join("\n"))).toEqual([
      "Delivered an implementation roadmap.",
      "Designed a phased rollout strategy.",
    ]);
  });

  it("returns nothing for a draft with no bullets", () => {
    expect(bulletsIn("Just prose, no list.")).toEqual([]);
  });
});


/*
 * A green tick sat directly above "5 bullets carry no number at all", because
 * the check passed on four figures anywhere in the draft. Both cannot be true.
 */
describe("quantified achievement, judged per bullet", () => {
  const noAnalysis = null;
  const draftOf = (bullets: string[]) => ["HEADLINE", "", "EXPERIENCE", ...bullets.map((b) => `• ${b}`)].join("\n");

  it("fails a draft whose figures are clustered in a couple of lines", () => {
    const result = scoreAts(draftOf([
      "Cut rework by 30% and cost by 12% across 4 releases in 2 regions.",
      "Analysed a live retail dataset to diagnose inefficiencies.",
      "Designed decision logic for an automated tool.",
      "Presented a structured recommendation to a judging panel.",
      "Collaborated with an industry mentor to refine the solution.",
    ]), noAnalysis);

    /* Exactly four figures in the document — the old rule's pass threshold. */
    expect(result.metricsFound).toBe(4);
    expect(result.checks[1].state).toBe("fail");
    expect(result.checks[1].detail).toMatch(/1 of 5 bullets carry a figure/);
  });

  it("passes when most lines carry one", () => {
    const result = scoreAts(draftOf([
      "Cut rework by 30%.",
      "Analysed 40,000 rows of retail data.",
      "Led a team of 3.",
      "Presented to a panel.",
    ]), noAnalysis);
    expect(result.checks[1].state).toBe("pass");
    expect(result.checks[1].detail).toMatch(/3 of 4 bullets carry a figure/);
  });

  it("says so plainly when there are no bullets to judge", () => {
    const result = scoreAts("Just prose, no list at all, running to some length.", noAnalysis);
    expect(result.bulletCount).toBe(0);
    expect(result.checks[1].state).toBe("fail");
    expect(result.checks[1].detail).toMatch(/No bullet points found/);
  });
});

/*
 * "100% of the strengths this role wants" reads like a complete answer, and off
 * two matched capabilities it is barely an opinion — while carrying 60% of the
 * score. Same reasoning as the matcher's requirement coverage.
 */
describe("strength coverage, scaled by how much there was to use", () => {
  const body = (text: string) => text.padEnd(2400, " delivery experience requirement");

  it("discounts a perfect score drawn from one or two strengths", () => {
    const thin = scoreAts(body("Business analysis every day."), analysis([], ["Business analysis"]));
    expect(thin.checks[0].detail).toMatch(/1 of the 1 strength/);
    expect(thin.checks[0].state).not.toBe("pass");

    const full = scoreAts(
      body("Business analysis, agile delivery, data analysis and stakeholder management."),
      analysis([], ["Business analysis", "Agile delivery", "Data analysis", "Stakeholder management"]),
    );
    expect(full.checks[0].detail).toMatch(/4 of the 4 strengths/);
    expect(full.checks[0].state).toBe("pass");
  });
});

/*
 * Sartho's own drafts use "•", but the workbench takes a résumé somebody
 * already has, and those arrive with hyphens and asterisks. Recognising only
 * the marker Sartho emits meant a pasted CV looked like prose with no bullets
 * to improve at all.
 */
describe("bullet markers as people actually write them", () => {
  it("reads hyphen and asterisk bullets, not only Sartho's own", () => {
    expect(bulletsIn([
      "EXPERIENCE",
      "- Delivered an implementation roadmap.",
      "* Designed a phased rollout strategy.",
      "• Presented to a judging panel.",
      "  – Ran the workshop series.",
    ].join("\n"))).toEqual([
      "Delivered an implementation roadmap.",
      "Designed a phased rollout strategy.",
      "Presented to a judging panel.",
      "Ran the workshop series.",
    ]);
  });

  it("does not mistake a sentence containing a dash for a bullet", () => {
    expect(bulletsIn("Analysed data — and reported on it.")).toEqual([]);
  });
});
