import type { RuleAnalysis } from "@/lib/types";

export function presentRuleAnalysis(analysis: RuleAnalysis, storedSupport: number | null) {
  return {
    strongestMatch: analysis.primaryStrength ?? analysis.primaryLane ?? "No clear match found",
    profileSupport: analysis.evidenceBacking ?? analysis.technicalHeaviness ?? storedSupport ?? 0,
  };
}
