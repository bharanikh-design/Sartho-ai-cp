import type { RuleAnalysis } from "@/lib/types";

/*
 * How a résumé draft reads to an applicant tracking system, and what to do
 * about it.
 *
 * The first version of this file made a mistake worth naming, because it is the
 * mistake every résumé tool on the market makes deliberately. It took the
 * advert's requirements, subtracted the words the draft already used, and
 * offered the remainder as "terms to add".
 *
 * But those two lists are not the same kind of thing at all:
 *
 *   matchedSignals       capabilities this person's approved evidence supports.
 *                        A draft that omits one is losing a point it has
 *                        already earned. Fix it.
 *
 *   missingRequirements  capabilities the role asks for that the evidence does
 *                        NOT support. Putting one of these in the draft is not
 *                        optimisation, it is a lie — one that survives the
 *                        filter and then fails the interview.
 *
 * So they are separated, and the score counts only the first. Dividing by the
 * union punished someone for refusing to invent, which is precisely backwards.
 * The unbacked requirements are still reported, as the honest reason the role
 * is a stretch, never as something to type in.
 */

export type AtsCheck = {
  label: string;
  /** Whether this passed, or "warn" when it is worth a look but not wrong. */
  state: "pass" | "warn" | "fail";
  detail: string;
};

/** A line the draft would be stronger for quantifying. */
export type WeakBullet = {
  /** Position in the draft's list of bullets, so a rewrite can be put back. */
  index: number;
  text: string;
};

export type AtsScore = {
  /** 0–100, from the checks below. */
  score: number;
  /**
   * Capabilities the evidence supports that the draft never names. These are
   * the honest fixes: the person can already back every one.
   */
  unusedStrengths: string[];
  /**
   * What the role asks for that the evidence cannot back. Reported so the score
   * explains itself — never offered as words to add.
   */
  unbackedRequirements: string[];
  /** Bullets carrying no figure, listed so the advice is specific. */
  weakBullets: WeakBullet[];
  metricsFound: number;
  wordCount: number;
  checks: AtsCheck[];
};

/*
 * A figure a reader would recognise as a result: 42%, $1.2M, 11 countries.
 *
 * The bare-number branch used to be `\b\d[\d,]{1,}\b`, which needs two digits.
 * So a draft reading "a 6-member consulting team", "selected among 6 teams",
 * "a team of 3" and "a 3-minute pitch" was reported as "0 measurable figures"
 * — four real quantities, none of them counted, and advice to add numbers that
 * were already there. Single digits count.
 *
 * Currency and percentage come first so "42%" is read once as a percentage
 * rather than twice as "42" and again as the symbol.
 */
const METRIC_SOURCE = /(?:[$£€]\s?\d[\d,.]*\s?(?:k|m|bn|b)?|\d+(?:\.\d+)?\s?%|\b\d+(?:[.,]\d+)*\s?(?:k|m|bn)?\b)/gi;

/*
 * A fresh regex per call. A /g regex carries lastIndex between .test() calls,
 * so reusing one across bullets silently skips every other line.
 */
function hasMetric(line: string) {
  return new RegExp(METRIC_SOURCE.source, "i").test(line);
}

function normalise(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** The bullet lines of a generated draft, in order. */
export function bulletsIn(draft: string): string[] {
  return draft
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("•"))
    .map((line) => line.replace(/^•\s*/, "").trim())
    .filter(Boolean);
}

export function scoreAts(draft: string, analysis: RuleAnalysis | null): AtsScore {
  const text = draft.trim();
  const haystack = normalise(text);
  const wordCount = text ? text.split(/\s+/).length : 0;

  const evidenced = [...new Set((analysis?.matchedSignals ?? []).filter(Boolean))];
  const unusedStrengths = evidenced.filter((term) => !haystack.includes(normalise(term).trim()));
  const unbackedRequirements = [...new Set((analysis?.missingRequirements ?? []).filter(Boolean))];

  const strengthCoverage = evidenced.length
    ? Math.round(((evidenced.length - unusedStrengths.length) / evidenced.length) * 100)
    : 0;

  const bullets = bulletsIn(text);
  const weakBullets = bullets
    .map((bullet, index) => ({ index, text: bullet }))
    .filter((bullet) => !hasMetric(bullet.text));
  const metricsFound = text.match(new RegExp(METRIC_SOURCE.source, "gi"))?.length ?? 0;

  const checks: AtsCheck[] = [
    {
      label: "Evidence you can back, used",
      state: strengthCoverage >= 80 ? "pass" : strengthCoverage >= 50 ? "warn" : "fail",
      detail: evidenced.length
        ? `${strengthCoverage}% of the strengths this role wants — and that your evidence supports — appear in the draft.`
        : "Run the role analysis first: without it there is nothing to check the draft against.",
    },
    {
      label: "Quantified achievement",
      state: metricsFound >= 4 ? "pass" : metricsFound >= 2 ? "warn" : "fail",
      detail: weakBullets.length
        ? `${metricsFound} measurable figure${metricsFound === 1 ? "" : "s"}. ${weakBullets.length} bullet${weakBullets.length === 1 ? " carries" : "s carry"} no number at all.`
        : `${metricsFound} measurable figures, and every bullet carries one.`,
    },
    {
      label: "Length",
      state: wordCount >= 350 && wordCount <= 900 ? "pass" : wordCount ? "warn" : "fail",
      detail: wordCount
        ? `${wordCount} words. Most parsers and most readers do best between 350 and 900.`
        : "The draft is empty.",
    },
  ];

  /*
   * Weighted toward vocabulary because that is what gates an automated screen;
   * the other two matter to the person who reads it afterwards.
   */
  const stateScore = (state: AtsCheck["state"]) => (state === "pass" ? 100 : state === "warn" ? 55 : 0);
  const score = Math.round(
    strengthCoverage * 0.6
    + stateScore(checks[1].state) * 0.25
    + stateScore(checks[2].state) * 0.15,
  );

  return { score, unusedStrengths, unbackedRequirements, weakBullets, metricsFound, wordCount, checks };
}
