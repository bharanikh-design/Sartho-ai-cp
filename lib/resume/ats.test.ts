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
    expect(result.checks[1].detail).toMatch(/2 bullets carry no number/);
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
