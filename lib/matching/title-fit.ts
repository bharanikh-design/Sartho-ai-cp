import { normaliseText } from "@/lib/matching/skill-vocabulary";

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
  { words: ["intern", "internship", "trainee", "cadet", "graduate", "grad", "entry level", "apprentice"], level: 0 },
  { words: ["junior", "assistant", "associate", "jr"], level: 1 },
  { words: ["senior", "snr", "sr"], level: 3 },
  /*
   * "managing" was missing, and it cost a real search: ERM's "Managing
   * Consultant — ESG Due Diligence" scored 96% and was recommended to somebody
   * six months into their career. `includes(" manager ")` never matches
   * " managing ", so the title fell through to the unqualified default of 2,
   * one rung above the candidate, and passed the seniority filter.
   */
  { words: ["lead", "principal", "staff", "manager", "managing", "management", "executive"], level: 4 },
  { words: ["head", "director", "chief", "vp", "vice president", "partner", "associate director"], level: 5 },
];

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

function subjectOverlap(job: string[], held: string[]): number {
  if (!job.length || !held.length) return 0;
  const heldSet = new Set(held);
  const hits = job.filter((word) => heldSet.has(word)).length;
  // Measured against the shorter side, so "Analyst" against "Business Analyst"
  // is a strong partial match rather than a weak one.
  return hits / Math.min(job.length, held.length);
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
  const years = totalExperienceYears ?? 0;
  const fromYears: SeniorityLevel = years < 2 ? 0 : years < 4 ? 1 : years < 8 ? 2 : years < 12 ? 3 : 4;

  if (fromTitles === null) return fromYears;
  return Math.min(fromTitles, fromYears + 1) as SeniorityLevel;
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
  if (!jobSubject.length) return { score: 0, closest: null, closestIsHeld: false, seniorityGap: 0 };

  let best = { score: 0, closest: null as string | null, level: jobLevel, held: false };

  const consider = (title: string, weight: number, held: boolean) => {
    const overlap = subjectOverlap(jobSubject, titleSubject(title));
    if (overlap <= 0) return;
    const score = Math.round(overlap * 100 * weight);
    if (score > best.score) best = { score, closest: title, level: seniorityOf(title), held };
  };

  for (const title of heldTitles) consider(title, 1, true);
  for (const title of targetTitles) consider(title, 0.85, false);

  if (!best.closest) return { score: 0, closest: null, closestIsHeld: false, seniorityGap: 0 };

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
  };
}
