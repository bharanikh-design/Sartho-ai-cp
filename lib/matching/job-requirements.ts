import { capabilitiesIn } from "./skill-vocabulary";

export type RequirementImportance = "mandatory" | "important" | "preferred";
export type JobRequirement = {
  capability: string;
  importance: RequirementImportance;
  weight: number;
  evidenceText: string;
};

const MANDATORY = /\b(must|required|minimum|essential|mandatory|need to|at least|you have)\b/i;
const PREFERRED = /\b(preferred|desirable|nice to have|bonus|advantage|ideally|a plus)\b/i;

function importanceOf(text: string): RequirementImportance {
  if (MANDATORY.test(text)) return "mandatory";
  if (PREFERRED.test(text)) return "preferred";
  return "important";
}
const weightOf = (importance: RequirementImportance) => importance === "mandatory" ? 3 : importance === "important" ? 2 : 1;

export function extractJobRequirements(rawText: string): JobRequirement[] {
  const lines = rawText.split(/\n|(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
  const byCapability = new Map<string, JobRequirement>();
  for (const line of lines) {
    for (const capability of capabilitiesIn(line)) {
      const importance = importanceOf(line);
      const next = { capability, importance, weight: weightOf(importance), evidenceText: line.slice(0, 280) };
      const current = byCapability.get(capability);
      if (!current || next.weight > current.weight) byCapability.set(capability, next);
    }
  }
  return [...byCapability.values()];
}
