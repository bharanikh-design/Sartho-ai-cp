import type { RuleAnalysis } from "@/lib/types";

/*
 * How a résumé draft reads to an applicant tracking system.
 *
 * Three things an ATS actually does, and nothing it does not:
 *
 *   1. Looks for the words the advert used. A draft that never repeats the
 *      requirement's own vocabulary scores badly however well it is written.
 *   2. Rewards quantified achievement — figures survive keyword extraction and
 *      give a human reader something to hold on to.
 *   3. Rejects what it cannot parse. Length and structure matter.
 *
 * This is deterministic and reads the draft text itself. It makes no claim to
 * reproduce any particular vendor's algorithm, because none of them publish
 * one, and a number invented to look authoritative would be worse than none.
 */

export type AtsCheck = {
  label: string;
  /** Whether this passed, or "warn" when it is worth a look but not wrong. */
  state: "pass" | "warn" | "fail";
  detail: string;
};

export type AtsScore = {
  /** 0–100, from the checks below. */
  score: number;
  /** Requirement vocabulary from the advert that the draft never uses. */
  missingKeywords: string[];
  /** Quantified statements found in the draft. */
  metricsFound: number;
  wordCount: number;
  checks: AtsCheck[];
};

/* A figure a reader would recognise as a result: 42%, $1.2M, 11 countries. */
const METRIC_PATTERN = /(\d+(?:\.\d+)?\s?%|[$£€]\s?\d[\d,.]*\s?(?:k|m|bn|b)?\b|\b\d[\d,]{1,}\b|\b\d+(?:\.\d+)?\s?(?:k|m|bn)\b)/gi;

function normalise(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

export function scoreAts(draft: string, analysis: RuleAnalysis | null): AtsScore {
  const text = draft.trim();
  const haystack = normalise(text);
  const wordCount = text ? text.split(/\s+/).length : 0;

  /*
   * The keywords are the advert's own requirements, taken from the analysis —
   * not a generic list. A requirement the draft never names is the single most
   * common reason a truthful résumé is filtered out before a human sees it.
   */
  const required = [
    ...(analysis?.missingRequirements ?? []),
    ...(analysis?.matchedSignals ?? []),
  ];
  const unique = [...new Set(required.filter(Boolean))];
  const missingKeywords = unique.filter((keyword) => !haystack.includes(normalise(keyword).trim()));
  const keywordCoverage = unique.length
    ? Math.round(((unique.length - missingKeywords.length) / unique.length) * 100)
    : 0;

  const metricsFound = text.match(METRIC_PATTERN)?.length ?? 0;

  const checks: AtsCheck[] = [
    {
      label: "Requirement vocabulary",
      state: keywordCoverage >= 70 ? "pass" : keywordCoverage >= 40 ? "warn" : "fail",
      detail: unique.length
        ? `${keywordCoverage}% of the terms this role uses appear in the draft.`
        : "Run the role analysis first — without it there is no vocabulary to check against.",
    },
    {
      label: "Quantified achievement",
      state: metricsFound >= 4 ? "pass" : metricsFound >= 2 ? "warn" : "fail",
      detail: `${metricsFound} measurable figure${metricsFound === 1 ? "" : "s"} in the draft. Aim for four or more.`,
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
   * Weighted toward vocabulary because that is what actually gates an automated
   * screen; the other two matter to the person who reads it afterwards.
   */
  const stateScore = (state: AtsCheck["state"]) => (state === "pass" ? 100 : state === "warn" ? 55 : 0);
  const score = Math.round(
    keywordCoverage * 0.6
    + stateScore(checks[1].state) * 0.25
    + stateScore(checks[2].state) * 0.15,
  );

  return { score, missingKeywords, metricsFound, wordCount, checks };
}
