import { familyOfTitle } from "@/lib/matching/job-family";
import { seniorityOf, titleSubject } from "@/lib/matching/title-fit";

/*
 * Which résumé you already wrote is the right one to start this role from.
 *
 * Every tailored draft is built from scratch, which is correct the first time
 * and wasteful the fifth. Somebody who has written a résumé for a ServiceNow
 * delivery role and then saves a second, nearly identical one has already done
 * the work: chosen which evidence leads, which wording survived, which lines
 * they edited by hand. Starting the next one from a blank page throws all of
 * that away and asks them to make the same decisions again.
 *
 * So this answers one question — of the résumés this person has, which was
 * written for the role most like this one — and it answers it from the titles
 * alone. No model, no call, no cost. A suggestion that takes a second and is
 * sometimes wrong is useful; one that takes twenty seconds is not, whatever it
 * says.
 */

export type PastResume = {
  /** The application row this résumé belongs to, so the caller can open it. */
  applicationId: string;
  /** The role it was written for. */
  jobTitle: string;
  employer: string | null;
  /** ISO timestamp, used only to break ties between equally similar roles. */
  updatedAt: string;
};

export type ResumeSuggestion = {
  resume: PastResume;
  /** 0–100, how close the role it was written for is to this one. */
  score: number;
  /** Said in the second person, naming what actually matched. */
  reason: string;
};

/*
 * Below this the two roles are not the same kind of work and the suggestion
 * would be noise. Set where one distinctive word in common is not enough:
 * "Delivery Manager" and "Delivery Driver" share a word and nothing else.
 */
export const MIN_SUGGESTION_SCORE = 45;

/**
 * How alike two role titles are, 0–100.
 *
 * Subject words carry it — the words left after seniority and noise are
 * stripped, which is what makes "Senior ServiceNow Delivery Manager" and
 * "ServiceNow Delivery Lead" read as the same job at different levels. Family
 * agreement is a smaller, separate signal: it catches two titles that share no
 * words but are plainly the same line of work, and it is never enough on its
 * own.
 */
export function roleSimilarity(a: string, b: string): number {
  const left = titleSubject(a);
  const right = titleSubject(b);
  if (!left.length || !right.length) return 0;

  const rightSet = new Set(right);
  const hits = left.filter((word) => rightSet.has(word)).length;

  /*
   * Measured against the shorter title, so a short one is not punished for
   * being short: "Engagement Manager" and "Client Engagement Manager" are the
   * same job written at two lengths.
   *
   * Except when the shorter side is a single word, where that rule breaks
   * badly. Seniority words are stripped before comparing, so "Delivery
   * Manager" reduces to "delivery" alone — and against the shorter side every
   * title containing that word scores a perfect match. "Delivery Driver" came
   * out as a résumé worth reusing for a delivery manager role.
   *
   * One word in common is weak evidence, so it is measured against the richer
   * title instead and has to earn its place from the rest of the signal.
   */
  const shorter = Math.min(left.length, right.length);
  const overlap = hits / (shorter === 1 ? Math.max(left.length, right.length) : shorter);

  const familyA = familyOfTitle(a);
  const familyB = familyOfTitle(b);
  const sameFamily = Boolean(familyA) && familyA === familyB;

  /*
   * A level apart is still the same résumé's worth of evidence — a Lead and a
   * Manager version of one job want the same lines in a different order. Two
   * or more apart is a different document, so the similarity is reduced rather
   * than the suggestion suppressed: the caller's floor decides.
   */
  const levelGap = Math.abs(seniorityOf(a) - seniorityOf(b));
  const levelPenalty = levelGap >= 2 ? 0.75 : 1;

  return Math.round(Math.min(100, (overlap * 85 + (sameFamily ? 15 : 0)) * levelPenalty));
}

/** Why this résumé, in the words a person would use about it. */
function reasonFor(target: string, past: PastResume, score: number): string {
  const shared = (() => {
    const targetWords = titleSubject(target);
    const pastSet = new Set(titleSubject(past.jobTitle));
    return targetWords.filter((word) => pastSet.has(word));
  })();

  const role = past.employer ? `${past.jobTitle} at ${past.employer}` : past.jobTitle;
  if (shared.length) {
    return `You already wrote one for ${role}, which shares ${shared.join(", ")}.`;
  }
  /* No words in common, so it got here on family agreement alone — say so. */
  return score >= 90
    ? `You already wrote one for ${role}.`
    : `Your ${role} résumé is the closest thing you have — same line of work, different wording.`;
}

/**
 * The résumé worth starting this role from, or null when none is close enough.
 *
 * Ties break on recency, because the most recent version of a role is the one
 * carrying the person's latest edits — and if two are equally close, the newer
 * is the one they would have picked themselves.
 */
export function suggestResumeFor(targetTitle: string, past: PastResume[]): ResumeSuggestion | null {
  const title = targetTitle.trim();
  if (!title || !past.length) return null;

  const ranked = past
    .map((resume) => ({ resume, score: roleSimilarity(title, resume.jobTitle) }))
    .filter((entry) => entry.score >= MIN_SUGGESTION_SCORE)
    .sort((a, b) => b.score - a.score || Date.parse(b.resume.updatedAt || "") - Date.parse(a.resume.updatedAt || ""));

  const best = ranked[0];
  if (!best) return null;

  return { resume: best.resume, score: best.score, reason: reasonFor(title, best.resume, best.score) };
}
