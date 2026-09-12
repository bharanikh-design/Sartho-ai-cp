import { RESUME_WRITING_RULES } from "@/lib/resume/writing";

/*
 * Refusing a figure the person never gave.
 *
 * The model is told it may use only the bullet and the fact supplied, and is
 * not trusted to have obeyed. Every number in the rewrite must appear in one of
 * those two inputs; anything else is a fabrication, and a plausible invented
 * figure is exactly what somebody accepts without reading. So it is refused
 * rather than shown for approval.
 *
 * This is the one rule that separates Sartho's rewrite from every résumé tool
 * that will cheerfully turn "analysed a retail dataset" into "analysed a 2M-row
 * dataset driving 15% margin improvement". It lives in one place so the
 * job-specific and master-résumé routes cannot drift apart on it.
 */
export function inventedNumbersIn(rewritten: string, ...permitted: string[]): string[] {
  const allowed = new Set(permitted.join(" ").match(/\d+(?:[.,]\d+)*/g) ?? []);
  return (rewritten.match(/\d+(?:[.,]\d+)*/g) ?? []).filter((number) => !allowed.has(number));
}

/** The instruction both rewrite routes give, so they ask for the same thing. */
export const BULLET_REWRITE_RULES = [
  "You rewrite a single résumé bullet so that it carries a fact the person has just supplied.",
  "You may use ONLY the supplied bullet and the supplied fact. Never introduce a number, percentage, currency amount, duration, team size, employer, tool, certification or outcome that is not in one of them.",
  RESUME_WRITING_RULES,
  "If the supplied fact contains no usable detail, return the original bullet unchanged and set usedFact to false.",
  "Do not exaggerate the fact. If the person says 'about 30 records', do not write '30+' or 'thousands'.",
  "Return the bullet text only, with no leading bullet character.",
].join(" ");

/*
 * Going first, without inventing.
 *
 * The loop used to open on a blank box: your bullet, a generic placeholder
 * about "40,000 rows" that had nothing to do with it, and a demand that you do
 * the writing. That is not assistance, it is a form.
 *
 * So the model drafts the stronger line immediately — but every quantity it
 * does not know is left as a labelled blank, `[how many phases]`, for the
 * person to fill or edit. It gets to be useful first and still cannot make
 * anything up, because the thing it would have had to invent is visibly absent
 * instead. A blank is honest in a way a plausible number never is.
 */
export const BULLET_PROPOSE_RULES = [
  "You are shown one résumé bullet. Rewrite it as the stronger line it could be.",
  "You do NOT know this person's figures and must never guess one. Every quantity you cannot read in the bullet itself must appear as a square-bracketed blank naming what is wanted — [how many phases], [over how many weeks], [how many stakeholders].",
  "Never write a number, percentage, currency amount, duration, team size, tool, employer or certification that is not already in the bullet. A blank is always correct where a guess is not.",
  RESUME_WRITING_RULES,
  "Keep the facts they stated. Do not add scope, seniority or impact the bullet does not claim.",
  "A line can be made stronger without a figure at all. If the bullet already names real scope, or if its weakness is a limp opener, the passive voice or a claim no reader could check, fix that and add no blanks — a blank asking for a number the line does not need is busywork.",
  "Use at most three blanks: the ones that would most change how the line reads. A line dense with brackets is not a draft, it is homework.",
  "Also return two to four short questions naming exactly what would make this line strongest, each specific to this bullet and not generic résumé advice. If the line's problem is not a missing figure, the questions must not ask for one.",
  "Return the rewritten line only, with no leading bullet character.",
].join(" ");

/*
 * The blanks still waiting on a person.
 *
 * A draft carrying "[how many weeks]" must never reach a real résumé, so the
 * accept control stays shut until every one is filled. This is what makes the
 * propose-first flow safe: the model's ignorance is on the page, not papered
 * over.
 */
export function unfilledBlanks(text: string): string[] {
  return text.match(/\[[^\]\n]{1,60}\]/g) ?? [];
}
