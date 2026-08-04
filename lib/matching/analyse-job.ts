import type { SkillProfile, SkillStrength } from "@/lib/matching/skill-profile";

/*
 * Reading a job description against one person's evidence.
 *
 * This file used to carry a career hard-coded into it: three named role lanes,
 * sixty-odd keyword signals, and a list of job titles to steer away from. That
 * worked for exactly one person, and for anyone else it did something worse
 * than fail — it kept answering confidently from someone else's CV.
 *
 * Nothing about any career is written down here now. The signals are the
 * user's own skills, derived from evidence they approved. A skill they cannot
 * evidence cannot match, and a role outside everything they can evidence is
 * reported as exactly that rather than forced into a category.
 */

export type JobRecommendation = "apply" | "review" | "skip";
export type Confidence = "low" | "medium" | "high";

export type SkillHit = {
  name: string;
  strength: SkillStrength;
  evidenceCount: number;
};

export type JobAnalysis = {
  recommendation: JobRecommendation;
  /** The strongest evidenced skill this role calls for, or null when none does. */
  primaryStrength: string | null;
  confidence: Confidence;
  /** Share of the user's core and strong skills the role asks for, 0–100. */
  coverage: number;
  /** How much of what the role asks for is backed by evidence, 0–100. */
  evidenceBacking: number;
  matchedSignals: string[];
  cautionSignals: string[];
  matchedSkills: SkillHit[];
  /** Leading skills the role never mentions — the size of the pivot. */
  unusedStrengths: string[];
  explanation: string;
};

const strengthScore: Record<SkillStrength, number> = {
  core: 4,
  strong: 3,
  supporting: 2,
  emerging: 1,
};

function comparisonForm(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/*
 * Whole-term matching rather than substring. A skill named "R" or "Go" would
 * otherwise fire on almost any prose, and "SAP" would match "sapphire".
 */
function mentions(haystack: string, needle: string) {
  const term = comparisonForm(needle).trim();
  if (!term) return false;
  return haystack.includes(` ${term} `);
}

function nothingToSayYet(explanation: string): JobAnalysis {
  return {
    recommendation: "review",
    primaryStrength: null,
    confidence: "low",
    coverage: 0,
    evidenceBacking: 0,
    matchedSignals: [],
    cautionSignals: [],
    matchedSkills: [],
    unusedStrengths: [],
    explanation,
  };
}

export function analyseJobDescription(rawText: string, profile: SkillProfile): JobAnalysis {
  if (rawText.trim().length < 120) {
    return nothingToSayYet("Paste the complete job description before making an application decision.");
  }

  if (!profile.skills.length) {
    /*
     * With no evidence there is nothing to compare against, and guessing here
     * is the exact failure this rewrite exists to remove.
     */
    return nothingToSayYet(
      "Sartho has no approved evidence to read this role against yet. Upload a résumé and approve your claims first.",
    );
  }

  const haystack = comparisonForm(rawText);

  const matchedSkills: SkillHit[] = profile.skills
    .filter((skill) => mentions(haystack, skill.name))
    .map((skill) => ({ name: skill.name, strength: skill.strength, evidenceCount: skill.evidenceCount }));

  const leading = profile.skills.filter((skill) => skill.strength === "core" || skill.strength === "strong");
  const leadingMatched = matchedSkills.filter((skill) => skill.strength === "core" || skill.strength === "strong");

  const coverage = leading.length ? Math.round((leadingMatched.length / leading.length) * 100) : 0;
  const weight = matchedSkills.reduce((sum, skill) => sum + strengthScore[skill.strength], 0);
  const evidenceBacking = Math.min(100, weight * 12);

  const unusedStrengths = leading
    .filter((skill) => !matchedSkills.some((hit) => hit.name === skill.name))
    .map((skill) => skill.name);

  const strongest = matchedSkills
    .slice()
    .sort((a, b) => strengthScore[b.strength] - strengthScore[a.strength] || b.evidenceCount - a.evidenceCount)[0];

  let recommendation: JobRecommendation;
  if (!matchedSkills.length) {
    recommendation = "skip";
  } else if (leadingMatched.length >= 2 && coverage >= 40) {
    recommendation = "apply";
  } else {
    recommendation = "review";
  }

  /*
   * Seven is one core skill plus one strong one — the point at which two
   * independently corroborated strengths both appear, which is as certain as a
   * keyword read of a job advert can honestly claim to be.
   */
  const confidence: Confidence = weight >= 7 ? "high" : weight >= 3 ? "medium" : "low";

  const explanation = !matchedSkills.length
    ? "None of your evidenced skills appear in this role. It may still be worth reading, but Sartho cannot show that you belong in it from what you have approved."
    : recommendation === "apply"
      ? `This role calls for ${leadingMatched.length} of your ${leading.length} strongest evidenced skills. Check the mandatory requirements, location and work authorisation before applying.`
      : `This role touches ${matchedSkills.length} of your evidenced skill${matchedSkills.length === 1 ? "" : "s"} but only ${leadingMatched.length} of your strongest. Read the mandatory requirements against your approved evidence before deciding.`;

  return {
    recommendation,
    primaryStrength: strongest?.name ?? null,
    confidence,
    coverage,
    evidenceBacking,
    matchedSignals: matchedSkills.map((skill) => skill.name).slice(0, 10),
    cautionSignals: unusedStrengths.slice(0, 10),
    matchedSkills,
    unusedStrengths,
    explanation,
  };
}
