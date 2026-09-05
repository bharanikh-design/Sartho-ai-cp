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
  "You rewrite a single résumé bullet so that a fact the candidate supplied is stated plainly inside it.",
  "You may use ONLY the supplied bullet and the supplied fact. Never introduce a number, percentage, currency amount, duration, team size, employer, tool, certification or outcome that is not in one of them.",
  "If the supplied fact contains no usable detail, return the original bullet unchanged and set usedFact to false.",
  "Do not exaggerate the fact. If the person says 'about 30 records', do not write '30+' or 'thousands'.",
  "Keep it one sentence, keep their voice, lead with the action, and do not add a closing flourish about impact that the fact does not support.",
  "Return the bullet text only, with no leading bullet character.",
].join(" ");
