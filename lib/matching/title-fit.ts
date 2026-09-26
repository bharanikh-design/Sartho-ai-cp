import { normaliseText } from "@/lib/matching/skill-vocabulary";
import { familyOfTitle } from "@/lib/matching/job-family";

/*
 * How close a job title is to what this person has actually done.
 *
 * The old matcher never looked at titles at all. Someone whose career history
 * reads "Business Analyst", reading a job called "Business Analyst", scored
 * nothing — because the score came only from keyword hits on category tags.
 * Job title is the single strongest, cheapest signal there is, and it was on
 * the floor.
 *
 * Seniority is read separately from the subject, so "Senior Business Analyst"
 * and "Business Analyst" are recognised as the same work at different levels,
 * and a claim to be ready for the more senior one is tempered rather than
 * assumed.
 */

export type SeniorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

const SENIORITY_WORDS: Array<{ words: string[]; level: SeniorityLevel }> = [
  {
    words: [
      "intern", "internship", "trainee", "cadet", "graduate", "grad", "entry level",
      "apprentice", "vacationer", "fresher", "new grad", "student", "campus",
      "werkstudent", "praktikant", "praktikum",
    ],
    level: 0,
  },
  { words: ["junior", "assistant", "associate", "jr"], level: 1 },
  { words: ["senior", "snr", "sr", "mid-senior", "experienced"], level: 3 },
  /*
   * "managing" was missing, and it cost a real search: ERM's "Managing
   * Consultant — ESG Due Diligence" scored 96% and was recommended to somebody
   * six months into their career. `includes(" manager ")` never matches
   * " managing ", so the title fell through to the unqualified default of 2,
   * one rung above the candidate, and passed the seniority filter.
   */
  { words: ["lead", "principal", "staff", "manager", "managing", "management", "executive", "expert"], level: 4 },
  { words: ["head", "director", "chief", "vp", "vice president", "partner", "associate director"], level: 5 },
];

const ENTRY_TITLE_TERMS = [
  "intern", "internship", "trainee", "cadet", "graduate", "grad", "entry level",
  "apprentice", "apprenticeship", "vacationer", "fresher", "new grad", "student",
  "campus", "junior", "jr", "assistant", "werkstudent", "praktikant", "praktikum",
];

const SENIOR_TITLE_TERMS = [
  "senior", "snr", "sr", "lead", "principal", "manager", "managing", "management",
  "head", "director", "chief", "vp", "vice president", "partner", "associate director",
  "executive", "staff", "experienced", "mid-senior", "expert",
];

/** Whether a job title explicitly states it is for people starting out. */
export function isEntryLevelTitle(title: string): boolean {
  const haystack = normaliseText(title);
  return ENTRY_TITLE_TERMS.some((term) => haystack.includes(` ${term} `));
}

/** Whether a job title explicitly carries senior/leadership qualifiers. */
export function hasSeniorTitleModifier(title: string): boolean {
  const haystack = normaliseText(title);
  return SENIOR_TITLE_TERMS.some((term) => haystack.includes(` ${term} `));
}

/* Words that describe the shape of a job rather than its subject. */
const NOISE = new Set([
  "the", "and", "of", "for", "in", "at", "to", "a", "an", "with",
  "full", "time", "part", "permanent", "contract", "casual", "temporary",
  "role", "position", "opportunity", "vacancy", "job", "career", "careers",
  "new", "we", "are", "hiring", "apply", "now", "m", "f", "d", "x",
  "remote", "hybrid", "onsite", "on", "site", "office", "based",
]);

export function seniorityOf(title: string): SeniorityLevel {
  const haystack = normaliseText(title);
  let level: SeniorityLevel = 2; // an unqualified title is mid-level
  for (const entry of SENIORITY_WORDS) {
    if (entry.words.some((word) => haystack.includes(` ${word} `))) {
      // The most senior word present wins ("Senior Manager" is a manager).
      if (entry.level > level || level === 2) level = entry.level;
    }
  }
  return level;
}

/** The subject of a title, with seniority and boilerplate stripped. */
export function titleSubject(title: string): string[] {
  const seniorityWords = new Set(SENIORITY_WORDS.flatMap((entry) => entry.words));
  return normaliseText(title)
    .trim()
    .split(" ")
    .filter((word) => word.length > 1 && !NOISE.has(word) && !seniorityWords.has(word));
}

/*
 * Words that describe the role shape rather than the specialism. They are useful
 * for finding a comparable title, but they must not be allowed to erase the
 * subject matter around them. "Project Manager" is a role shape; SAP/FICO,
 * ServiceNow/ITSM, AML/KYC and cybersecurity are the context that tells us
 * whether two Project Manager roles are actually comparable.
 */
const ROLE_SHAPE_WORDS = new Set([
  "project", "program", "programme", "portfolio", "delivery", "implementation",
  "solution", "solutions", "manager", "management", "lead", "leader", "director",
  "head", "consultant", "consulting", "analyst", "architect", "engineer",
  "specialist", "owner", "officer", "coordinator", "principal", "associate",
]);

function specialistTerms(subject: string[]): string[] {
  return subject.filter((word) => !ROLE_SHAPE_WORDS.has(word));
}

function subjectOverlap(job: string[], held: string[]): number {
  if (!job.length || !held.length) return 0;

  /*
   * Jaccard similarity makes unmatched qualifiers count on both sides.
   * The previous implementation divided by the shorter title, which made
   * "SAP FICO Project Manager & Solution Architect" a 100% title match for
   * "Project Manager" because the one surviving generic word was present.
   */
  const jobSet = new Set(job);
  const heldSet = new Set(held);
  const hits = [...jobSet].filter((word) => heldSet.has(word)).length;
  const union = new Set([...jobSet, ...heldSet]).size;
  return union ? hits / union : 0;
}

/**
 * The level this person is currently at, from the titles they have held and how
 * long they have worked. Someone fresh out of university is level 0; the fact
 * that a job is titled "Senior Manager" then tells you it is not for them yet.
 */
export function candidateSeniority(heldTitles: string[], totalExperienceYears: number | null): SeniorityLevel {
  const fromTitles = heldTitles.length
    ? (Math.max(...heldTitles.map((title) => seniorityOf(title))) as SeniorityLevel)
    : null;

  /*
   * Years are the sanity check on titles. Job titles inflate — a six-month
   * internship can be called "Consultant" — so someone with under two years is
   * treated as entry level whatever their title said, and the title only takes
   * over once there is enough history to support it.
   */
  /*
   * `?? 0` does not catch NaN, and every comparison against NaN is false — so a
   * corrupt or unparsed year count fell through every band to 4, the manager
   * grade, and handed the person a seniority they had not earned. Infinity did
   * the same. Anything that is not a real, positive number is treated as an
   * unanswered question, exactly as null already was.
   */
  const years = Number.isFinite(totalExperienceYears) && (totalExperienceYears as number) > 0
    ? (totalExperienceYears as number)
    : 0;
  const fromYears: SeniorityLevel = years < 2 ? 0 : years < 4 ? 1 : years < 8 ? 2 : years < 12 ? 3 : 4;

  if (fromTitles === null) return fromYears;
  /*
   * Years are a floor as well as a ceiling, and only the ceiling was here.
   *
   * `min(title, years + 1)` tempers an inflated title, which is what it was
   * written for. But it also lets a modest title drag an experienced person
   * down: "Architect", "Consultant" and "Specialist" carry no seniority word,
   * so seniorityOf reads them as the unqualified 2 — and a ServiceNow Solution
   * Architect with a decade behind them came out level 2, the same as somebody
   * four years in.
   *
   * That number is a hard filter in two places. Career Direction dropped every
   * leadership direction it was asked to suggest them as "more than one grade
   * above", leaving a single role on the page beside an error; the job search
   * hid the same roles for the same reason.
   *
   * So the years set the floor, the title may lift it by one, and an inflated
   * title is still tempered to one grade above the years. Nobody moves down.
   */
  return Math.max(fromYears, Math.min(fromTitles, fromYears + 1)) as SeniorityLevel;
}

export type TitleFit = {
  /** 0–100. How well the job title matches something this person has done or targets. */
  score: number;
  /** The closest title from their history or targets, for showing the reason. */
  closest: string | null;
  /**
   * Whether `closest` is a job they have held or one they are only aiming at.
   * The UI said "matches your Management Consultant experience" about a role
   * the person had never held — it was a target they had typed.
   */
  closestIsHeld: boolean;
  /** Levels the job sits above their strongest comparable title. Negative means below. */
  seniorityGap: number;
  /**
   * True when the job and the person's own titles carry different specialist
   * contexts and only generic role-shape words overlap.
   */
  specialistConflict: boolean;
};

/**
 * Compare one job title against every title the person has held and every role
 * they are targeting. Held titles are the stronger evidence; a target role is a
 * stated intention, so it counts but slightly less.
 */
export function scoreTitleFit(
  jobTitle: string,
  heldTitles: string[],
  targetTitles: string[] = [],
): TitleFit {
  const jobSubject = titleSubject(jobTitle);
  const jobLevel = seniorityOf(jobTitle);
  if (!jobSubject.length) return { score: 0, closest: null, closestIsHeld: false, seniorityGap: 0, specialistConflict: false };

  /*
   * Build a profile-level specialist context from every held and targeted title.
   * This is deliberately data-driven: there is no "ban SAP" list. If the job
   * carries specialist terms and the person's own titles carry different
   * specialist terms, generic role-shape overlap is not allowed to dominate.
   */
  const jobFamily = familyOfTitle(jobTitle);
  const comparableTitles = [...heldTitles, ...targetTitles].filter(
    (title) => jobFamily && familyOfTitle(title) === jobFamily,
  );
  const candidateSpecialists = new Set(
    comparableTitles.flatMap((title) => specialistTerms(titleSubject(title))),
  );
  const jobSpecialists = specialistTerms(jobSubject);
  const specialistConflict = Boolean(jobFamily)
    && jobSpecialists.length > 0
    && candidateSpecialists.size > 0
    && !jobSpecialists.some((word) => candidateSpecialists.has(word));

  let best = { score: 0, closest: null as string | null, level: jobLevel, held: false };

  const consider = (title: string, weight: number, held: boolean) => {
    const overlap = subjectOverlap(jobSubject, titleSubject(title));
    if (overlap <= 0) return;

    let score = Math.round(overlap * 100 * weight);
    /*
     * A contradictory specialist context is a hard ceiling, not a small
     * deduction. Other evidence can still make the opportunity worth reading,
     * but title similarity alone cannot manufacture a high match.
     */
    if (specialistConflict) score = Math.min(score, 20);

    if (score > best.score) best = { score, closest: title, level: seniorityOf(title), held };
  };

  for (const title of heldTitles) consider(title, 1, true);
  for (const title of targetTitles) consider(title, 0.85, false);

  if (!best.closest) return { score: 0, closest: null, closestIsHeld: false, seniorityGap: 0, specialistConflict: false };

  /*
   * A job two or more levels above anything held is a genuine stretch. The
   * subject still matches, so the score stays meaningful — it is reduced, not
   * erased, and the gap is reported so the reason can be shown rather than the
   * number simply looking pessimistic.
   */
  const seniorityGap = jobLevel - best.level;
  const penalty = seniorityGap >= 3 ? 0.3 : seniorityGap === 2 ? 0.6 : seniorityGap === 1 ? 0.85 : 1;

  return {
    score: Math.max(0, Math.min(100, Math.round(best.score * penalty))),
    closest: best.closest,
    closestIsHeld: best.held,
    seniorityGap,
    specialistConflict,
  };
}
