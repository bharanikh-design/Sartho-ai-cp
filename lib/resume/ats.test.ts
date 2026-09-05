import { describe, expect, it } from "vitest";
import { scoreAts } from "./ats";
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
  it("names the advert's own terms that the draft never uses", () => {
    const result = scoreAts(
      draft("Led business analysis across two releases."),
      analysis(["Agile delivery"], ["Business analysis"]),
    );
    expect(result.missingKeywords).toContain("Agile delivery");
    expect(result.missingKeywords).not.toContain("Business analysis");
  });

  it("counts quantified achievement, not any digit", () => {
    const result = scoreAts(draft("Cut cost by 42% and saved $1.2M across 11 countries."), analysis([], []));
    expect(result.metricsFound).toBeGreaterThanOrEqual(3);
  });

  it("scores a draft that uses the vocabulary above one that does not", () => {
    const covered = scoreAts(draft("Business analysis and agile delivery every sprint, cutting 30% of rework."), analysis([], ["Business analysis", "Agile delivery"]));
    const bare = scoreAts(draft("Did some work on things."), analysis([], ["Business analysis", "Agile delivery"]));
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
