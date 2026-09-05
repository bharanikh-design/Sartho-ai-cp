import type { SkillProfile, SkillStrength } from "@/lib/matching/skill-profile";
import { capabilitiesIn } from "@/lib/matching/skill-vocabulary";
import type { TitleFit } from "@/lib/matching/title-fit";

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
 *
 * What changed after that: the comparison itself. It used to search the advert
 * for the literal text of the person's category tags, so a Business Analyst
 * reading a Business Analyst posting scored zero — that advert says
 * "requirements", "BRD" and "backlog", and never the word "Consulting". Both
 * sides are now resolved through a shared vocabulary of capability, and the job
 * title is read as its own signal, which it never was.
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
  /** Share of what this role asks for that the user can evidence, 0–100. */
  requirementCoverage: number;
  /** How much of what the role asks for is backed by evidence, 0–100. */
  evidenceBacking: number;
  /** How close the job title is to something the person has done, 0–100. */
  titleFit: number;
  /** The held or targeted title this job most resembles. */
  closestTitle: string | null;
  /** Levels this job sits above the closest comparable title. */
  seniorityGap: number;
  /** Capabilities this role asks for that the person cannot yet evidence. */
  missingRequirements: string[];
  matchedSignals: string[];
  cautionSignals: string[];
  matchedSkills: SkillHit[];
  /** Leading skills the role never mentions — the size of the pivot. */
  unusedStrengths: string[];
  explanation: string;
};

export type AnalysisContext = {
  /** Computed by the caller, which knows the person's held and targeted titles. */
  titleFit?: TitleFit;
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
    requirementCoverage: 0,
    evidenceBacking: 0,
    titleFit: 0,
    closestTitle: null,
    seniorityGap: 0,
    missingRequirements: [],
    matchedSignals: [],
    cautionSignals: [],
    matchedSkills: [],
    unusedStrengths: [],
    explanation,
  };
}

export function analyseJobDescription(
  rawText: string,
  profile: SkillProfile,
  context: AnalysisContext = {},
): JobAnalysis {
  const titleFit = context.titleFit?.score ?? 0;
  const closestTitle = context.titleFit?.closest ?? null;
  const seniorityGap = context.titleFit?.seniorityGap ?? 0;

  if (rawText.trim().length < 120) {
    return {
      ...nothingToSayYet("Paste the complete job description before making an application decision."),
      titleFit,
      closestTitle,
      seniorityGap,
    };
  }

  if (!profile.skills.length) {
    /*
     * With no evidence there is nothing to compare against, and guessing here
     * is the exact failure this rewrite exists to remove.
     */
    return nothingToSayYet(
      "Sartho needs a confirmed Career Profile before it can judge this role. Review your profile first, then analyse the opportunity again.",
    );
  }

  const haystack = comparisonForm(rawText);

  /*
   * What this advert actually asks for, in the same vocabulary the profile is
   * described in. This is the half that was missing: previously the advert was
   * only ever searched for the person's own labels, so a requirement phrased
   * any other way was invisible.
   */
  const asked = capabilitiesIn(rawText);

  const matchedSkills: SkillHit[] = profile.skills
    .filter((skill) => asked.has(skill.capability) || mentions(haystack, skill.name))
    .map((skill) => ({ name: skill.name, strength: skill.strength, evidenceCount: skill.evidenceCount }));

  const evidenced = new Set(profile.skills.map((skill) => skill.capability));
  const missingRequirements = [...asked].filter((capability) => !evidenced.has(capability));

  /*
   * Two different questions, both worth answering:
   *   requirementCoverage — how much of this job can I evidence?
   *   coverage            — how much of what I am best at does this job use?
   * The first decides whether to apply; the second says how big a pivot it is.
   */
  const requirementCoverage = asked.size
    ? Math.round(((asked.size - missingRequirements.length) / asked.size) * 100)
    : 0;

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

  /*
   * A recommendation now rests on two independent legs — having done the job
   * before, and being able to evidence what it asks for. Either one alone is
   * worth a look; both together is worth applying for; neither is a skip.
   */
  let recommendation: JobRecommendation;
  if (!matchedSkills.length && titleFit < 40) {
    recommendation = "skip";
  } else if ((titleFit >= 60 && requirementCoverage >= 35) || (leadingMatched.length >= 2 && requirementCoverage >= 50)) {
    recommendation = "apply";
  } else {
    recommendation = "review";
  }

  /*
   * Seven is one core skill plus one strong one — the point at which two
   * independently corroborated strengths both appear, which is as certain as a
   * keyword read of a job advert can honestly claim to be. A close title match
   * is corroboration of the same kind.
   */
  const confidence: Confidence = weight >= 7 || (titleFit >= 70 && weight >= 3)
    ? "high"
    : weight >= 3 || titleFit >= 50
      ? "medium"
      : "low";

  const titleSentence = closestTitle
    ? seniorityGap >= 2
      ? `The title is a step up from your ${closestTitle}.`
      : titleFit >= 70
        ? `The title closely matches your experience as ${closestTitle}.`
        : `The title is related to your experience as ${closestTitle}.`
    : "";

  const explanation = !matchedSkills.length && !titleFit
    ? "None of the skills in your confirmed Career Profile appear in this role. It may still be worth reading, but Sartho cannot yet show a strong fit."
    : recommendation === "apply"
      ? `${titleSentence} You can evidence ${requirementCoverage}% of what this role asks for, across ${matchedSkills.length} capabilit${matchedSkills.length === 1 ? "y" : "ies"}. Check the mandatory requirements, location and work authorisation before applying.`.trim()
      : `${titleSentence} You can evidence ${requirementCoverage}% of what this role asks for.${missingRequirements.length ? ` It also asks for ${missingRequirements.slice(0, 3).join(", ")}, which your approved evidence does not yet cover.` : ""} Review the mandatory requirements before deciding.`.trim();

  return {
    recommendation,
    primaryStrength: strongest?.name ?? null,
    confidence,
    coverage,
    requirementCoverage,
    evidenceBacking,
    titleFit,
    closestTitle,
    seniorityGap,
    missingRequirements,
    matchedSignals: matchedSkills.map((skill) => skill.name).slice(0, 10),
    cautionSignals: missingRequirements.slice(0, 10),
    matchedSkills,
    unusedStrengths,
    explanation,
  };
}
