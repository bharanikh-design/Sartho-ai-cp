import { describe, expect, it } from "vitest";
import type { RuleAnalysis } from "@/lib/types";
import { presentRuleAnalysis } from "./present-rule-analysis";

const common = {
  recommendation: "review" as const,
  confidence: "high",
  matchedSignals: ["ServiceNow"],
  cautionSignals: [],
  explanation: "Review the requirements.",
};

describe("saved rule analysis presentation", () => {
  it("renders the current matcher fields", () => {
    expect(presentRuleAnalysis({
      ...common,
      primaryStrength: "ServiceNow",
      evidenceBacking: 72,
    }, null)).toEqual({ strongestMatch: "ServiceNow", profileSupport: 72 });
  });

  it("still renders an older saved analysis", () => {
    const legacy: RuleAnalysis = {
      ...common,
      primaryLane: "Transformation",
      technicalHeaviness: 48,
    };
    expect(presentRuleAnalysis(legacy, null)).toEqual({
      strongestMatch: "Transformation",
      profileSupport: 48,
    });
  });
});
