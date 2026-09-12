import type { RuleAnalysis } from "@/lib/types";
import { PASSIVE_VOICE, WEAK_OPENER } from "@/lib/resume/writing";

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

/*
 * How many matched strengths make a coverage figure worth stating at full
 * confidence. Below this the analysis found too little to be sure the draft is
 * presenting the person well, however much of that little it used.
 */
export const MIN_STRENGTHS_FOR_CONFIDENCE = 4;

export type AtsCheck = {
  label: string;
  /** Whether this passed, or "warn" when it is worth a look but not wrong. */
  state: "pass" | "warn" | "fail";
  detail: string;
  /** This check's share of the score. The applicable weights are renormalised. */
  weight: number;
  /**
   * False when there is nothing to judge the draft against — currently only the
   * evidence check, which needs a role analysis to have run.
   *
   * An inapplicable check is left out of the score rather than scored zero, and
   * that distinction is the whole point. The workbench always scores with no
   * analysis, so the evidence check could never pass there; it was still worth
   * 60% of the number, which capped a flawless résumé at 40 out of 100 and made
   * the panel hide a check whose zero it was still counting. A question nobody
   * has been asked is not a question they got wrong.
   */
  applicable: boolean;
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
  /** Bullets in the draft, so a proportion has a denominator. */
  bulletCount: number;
  metricsFound: number;
  wordCount: number;
  /**
   * The vocabulary component, 0–100, before weighting. Exposed because it is
   * the heaviest term in the score and the verdict has to know how much of the
   * shortfall lives there.
   */
  strengthCoverage: number;
  checks: AtsCheck[];
};

/** What the number means, and the one change that would move it most. */
export type AtsVerdict = {
  /** A few words a person can read at a glance. */
  headline: string;
  /** The largest gain still available, as something to do. Null when there is none. */
  lever: string | null;
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
 * A calendar year is a date, not a result.
 *
 * Every bare number counted as a figure, so "Led the ITSM rollout in 2019" read
 * as a quantified achievement and a career history full of dates reported a
 * third of itself as measurable when almost none of it was. The advice built on
 * that count then told people to add numbers to the wrong lines.
 *
 * Currency and percentages are protected, so "$2,000" and "2019%" still count —
 * a figure that carries a unit was never ambiguous.
 *
 * The known limit: a bare quantity that happens to land between 1900 and 2099
 * and carries no symbol or comma — "2019 basis points" — is read as a date and
 * not counted. That is the right way round to be wrong. A four-digit number in
 * that range is a year in almost every résumé that contains one, quantities
 * large enough to reach it are nearly always written with a separator ("2,400
 * tickets"), and the cost of the miss is one line being offered a figure it
 * already has — against a career history that otherwise reports most of its
 * dates as achievements.
 */
const CALENDAR_YEAR = /(?<![$£€]\s?)\b(?:19|20)\d{2}\b(?!\s?%)/g;

function withoutYears(value: string) {
  return value.replace(CALENDAR_YEAR, " ");
}

/*
 * Both patterns come from the shared writing standard rather than from a copy
 * kept here. They used to be defined in this file alone, which meant the panel
 * marked a draft down for weak openers and passive voice that no drafting
 * route had ever been told to avoid — a score for a rule that was never
 * stated. Now the instruction and the check read the same source.
 */

/*
 * A fresh regex per call. A /g regex carries lastIndex between .test() calls,
 * so reusing one across bullets silently skips every other line.
 */
function hasMetric(line: string) {
  return new RegExp(METRIC_SOURCE.source, "i").test(withoutYears(line));
}

function normalise(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/*
 * A bullet marker as people actually write them.
 *
 * Sartho's own drafts use "•", but the workbench takes a résumé somebody
 * already has, and those come with hyphens and asterisks. Recognising only the
 * one Sartho emits meant a pasted CV appeared to have no bullets at all —
 * scored as prose, with nothing to offer improving.
 */
export const BULLET_MARKER = /^[•\u2022\u2023\u25E6\u2043\u2219*\u00B7\u2013\u2014-]\s+/;

/** The bullet lines of a résumé, in order. */
export function bulletsIn(draft: string): string[] {
  const lines = draft.split("\n").map((line) => line.trim()).filter(Boolean);
  const strictBullets = lines
    .filter((line) => BULLET_MARKER.test(line))
    .map((line) => line.replace(BULLET_MARKER, "").trim())
    .filter(Boolean);
    
  // If the user pasted plain text without bullet markers, treat any sentence/line 
  // longer than 8 words as a 'bullet' so the ATS engine still provides feedback.
  if (strictBullets.length === 0) {
    return lines.filter(line => line.split(/\s+/).length > 8);
  }
  return strictBullets;
}

const stateScore = (state: AtsCheck["state"]) => (state === "pass" ? 100 : state === "warn" ? 55 : 0);

/*
 * A check's contribution, 0-100. The evidence check reports its own coverage
 * rather than a banded pass/warn/fail, because it is a proportion already and
 * rounding it to three steps threw away the difference between "half your
 * strengths" and "almost all of them".
 */
function checkValue(check: AtsCheck, strengthCoverage: number): number {
  return check.label === "Evidence you can back, used" ? strengthCoverage : stateScore(check.state);
}

function scoreFromChecks(checks: AtsCheck[], strengthCoverage: number): number {
  const applicable = checks.filter((check) => check.applicable);
  /* Nothing to judge at all — an empty draft with no analysis. */
  if (!applicable.length) return 0;
  const total = applicable.reduce((sum, check) => sum + check.weight, 0);
  const earned = applicable.reduce((sum, check) => sum + check.weight * checkValue(check, strengthCoverage), 0);
  return Math.round(earned / total);
}

export function scoreAts(draft: string, analysis: RuleAnalysis | null): AtsScore {
  const text = draft.trim();
  const haystack = normalise(text);
  const wordCount = text ? text.split(/\s+/).length : 0;

  const evidenced = [...new Set((analysis?.matchedSignals ?? []).filter(Boolean))];
  const unusedStrengths = evidenced.filter((term) => !haystack.includes(normalise(term).trim()));
  const unbackedRequirements = [...new Set((analysis?.missingRequirements ?? []).filter(Boolean))];

  /*
   * Scaled by how many strengths there were to use, for the same reason the
   * matcher scales requirement coverage: "100% of the strengths this role
   * wants" reads like a complete answer, and off two matched capabilities it
   * is barely an opinion. It carries 60% of this score, so an unearned 100
   * flatters the whole number.
   */
  const rawStrengthCoverage = evidenced.length
    ? ((evidenced.length - unusedStrengths.length) / evidenced.length) * 100
    : 0;
  const legibility = Math.min(1, evidenced.length / MIN_STRENGTHS_FOR_CONFIDENCE);
  const strengthCoverage = Math.round(rawStrengthCoverage * legibility);

  const bullets = bulletsIn(text);
  const weakBullets = bullets
    .map((bullet, index) => ({ index, text: bullet }))
    .filter((bullet) => !hasMetric(bullet.text));
  const metricsFound = withoutYears(text).match(new RegExp(METRIC_SOURCE.source, "gi"))?.length ?? 0;

  /*
   * Judged per bullet, not per document.
   *
   * The check used to pass on four figures anywhere in the draft, which put a
   * green tick directly above the sentence "5 bullets carry no number at all".
   * Both cannot be true. Six numbers clustered in two bullets is not a
   * quantified résumé; what a reader notices is the lines that say nothing
   * measurable, so that is what gets counted.
   */
  const quantifiedBullets = bullets.length - weakBullets.length;
  const bulletCoverage = bullets.length ? Math.round((quantifiedBullets / bullets.length) * 100) : 0;

  /*
   * The two checks every résumé tool runs and this one had written down but
   * never wired up: both regexes sat here unused, so a draft opening six
   * bullets with "Responsible for" scored exactly the same as one opening them
   * with "Cut", "Led" and "Shipped".
   */
  const weakVerbBullets = bullets.filter((bullet) => WEAK_OPENER.test(bullet));
  const passiveBullets = bullets.filter((bullet) => PASSIVE_VOICE.test(bullet));
  const strongVerbShare = bullets.length
    ? Math.round(((bullets.length - weakVerbBullets.length) / bullets.length) * 100)
    : 0;
  const activeVoiceShare = bullets.length
    ? Math.round(((bullets.length - passiveBullets.length) / bullets.length) * 100)
    : 0;

  const checks: AtsCheck[] = [
    {
      label: "Evidence you can back, used",
      weight: 0.5,
      /*
       * The only check that can be inapplicable. Without a role analysis there
       * is no list of strengths to look for, which is a different thing from
       * looking and finding none.
       */
      applicable: evidenced.length > 0,
      state: strengthCoverage >= 80 ? "pass" : strengthCoverage >= 50 ? "warn" : "fail",
      /*
       * The caveat has to be in the sentence, not only in the score.
       *
       * This read "2 of the 2 strengths this role wants appear in the draft"
       * under a warning icon. Both statements were true — every matched
       * strength was used, and two signals is too thin to be confident about —
       * but the sentence only carried the first, so the icon looked like a
       * mistake. A warning over text that reads as a perfect score teaches
       * people to ignore the warnings.
       */
      detail: !evidenced.length
        ? "Run the role analysis first: without it there is nothing to check the draft against."
        : [
            `${evidenced.length - unusedStrengths.length} of the ${evidenced.length} strength${evidenced.length === 1 ? "" : "s"} this role wants — and that your evidence supports — appear${evidenced.length - unusedStrengths.length === 1 ? "s" : ""} in the draft.`,
            evidenced.length < MIN_STRENGTHS_FOR_CONFIDENCE
              ? `That is only ${evidenced.length} signal${evidenced.length === 1 ? "" : "s"} to judge by, so this is not yet a confident read — the score is held back until there are ${MIN_STRENGTHS_FOR_CONFIDENCE}.`
              : "",
          ].filter(Boolean).join(" "),
    },
    {
      label: "Quantified achievement",
      weight: 0.2,
      applicable: true,
      state: !bullets.length ? "fail" : bulletCoverage >= 70 ? "pass" : bulletCoverage >= 40 ? "warn" : "fail",
      detail: !bullets.length
        ? "No bullet points found, so there is nothing to quantify."
        : weakBullets.length
          ? `${quantifiedBullets} of ${bullets.length} bullets carry a figure. ${weakBullets.length} say nothing measurable.`
          : `All ${bullets.length} bullets carry a figure.`,
    },
    {
      label: "Length",
      weight: 0.12,
      applicable: true,
      state: wordCount >= 350 && wordCount <= 900 ? "pass" : wordCount ? "warn" : "fail",
      detail: wordCount
        ? `${wordCount} words. Most parsers and most readers do best between 350 and 900.`
        : "The draft is empty.",
    },
    {
      label: "Strong opening verbs",
      weight: 0.1,
      applicable: bullets.length > 0,
      state: !bullets.length ? "fail" : strongVerbShare >= 90 ? "pass" : strongVerbShare >= 70 ? "warn" : "fail",
      detail: !bullets.length
        ? "No bullet points found, so there is nothing to check."
        : weakVerbBullets.length
          ? `${weakVerbBullets.length} of ${bullets.length} line${bullets.length === 1 ? "" : "s"} open with a verb that describes a duty rather than a result — "responsible for", "helped", "worked on".`
          : `All ${bullets.length} lines open on something you did.`,
    },
    {
      label: "Active voice",
      weight: 0.08,
      applicable: bullets.length > 0,
      state: !bullets.length ? "fail" : activeVoiceShare >= 85 ? "pass" : activeVoiceShare >= 65 ? "warn" : "fail",
      detail: !bullets.length
        ? "No bullet points found, so there is nothing to check."
        : passiveBullets.length
          ? `${passiveBullets.length} of ${bullets.length} line${bullets.length === 1 ? "" : "s"} are written in the passive voice, which hides who did the work.`
          : `All ${bullets.length} lines say who did the work.`,
    },
  ];

  /*
   * Weighted toward vocabulary because that is what gates an automated screen;
   * the rest matter to the person who reads it afterwards.
   *
   * Renormalised over the checks that apply, so the number always answers the
   * same question — "how good is this draft, out of everything that could be
   * judged about it" — whether or not a role analysis has run. Scoring an
   * unanswerable check as zero instead made a flawless résumé in the workbench
   * top out at 40, and the resulting red number was read as a verdict on the
   * résumé rather than on the missing analysis.
   */
  const score = scoreFromChecks(checks, strengthCoverage);

  return { score, unusedStrengths, unbackedRequirements, weakBullets, bulletCount: bullets.length, metricsFound, wordCount, strengthCoverage, checks };
}

/*
 * The score, said as a sentence, with the biggest lever named.
 *
 * A number on its own is a grade, and a grade is not advice. What somebody
 * editing a résumé wants to know is which of the three things wrong with it is
 * worth fixing first — and that is not a matter of opinion, because the score
 * is a weighted sum and the answer is arithmetic: the check with the largest
 * remaining gain, weight included.
 *
 * So this never guesses and never flatters. Vocabulary is weighted at 0.6, so
 * a draft missing two strengths is told about those before it is told its
 * length is off by forty words, however loud the length warning looks.
 */
export function atsVerdict(ats: AtsScore): AtsVerdict {
  const headline = ats.score >= 85
    ? "Ready to send"
    : ats.score >= 70
      ? "Strong"
      : ats.score >= 40
        ? "Getting there"
        : "Needs work";

  /*
   * The biggest lever is arithmetic, not opinion: the score is a weighted mean,
   * so the check with the most weight still on the table is the one worth
   * fixing first. Reading the weights off the checks themselves means this can
   * no longer drift from the scoring — it used to repeat 0.6/0.25/0.15 as
   * literals beside a scorer that owned the same three numbers.
   */
  const total = ats.checks.filter((check) => check.applicable).reduce((sum, check) => sum + check.weight, 0) || 1;

  const leverFor = (check: AtsCheck): string => {
    switch (check.label) {
      case "Evidence you can back, used":
        return ats.unusedStrengths.length
          ? `Work in ${ats.unusedStrengths.length} strength${ats.unusedStrengths.length === 1 ? "" : "s"} your evidence already backs`
          : "Run the role analysis so there is something to check the draft against";
      case "Quantified achievement":
        return ats.bulletCount
          ? `Put a figure in ${ats.weakBullets.length} line${ats.weakBullets.length === 1 ? "" : "s"} that carry none`
          : "Break the draft into bullet points";
      case "Length":
        return !ats.wordCount
          ? "Write something to score"
          : ats.wordCount < 350
            ? `Add about ${350 - ats.wordCount} more words`
            : ats.wordCount > 900
              ? `Cut about ${ats.wordCount - 900} words`
              : "Length is fine";
      case "Strong opening verbs":
        return "Open each line with what you did, not what you were responsible for";
      case "Active voice":
        return "Rewrite the passive lines so they say who did the work";
      default:
        return check.label;
    }
  };

  const best = ats.checks
    .filter((check) => check.applicable)
    .map((check) => ({
      /* Normalised the same way the score is, so the two always agree. */
      gain: ((100 - checkValue(check, ats.strengthCoverage)) * check.weight) / total,
      lever: leverFor(check),
    }))
    .reduce<{ gain: number; lever: string } | null>(
      (worst, entry) => (worst === null || entry.gain > worst.gain ? entry : worst),
      null,
    );

  /*
   * The one check that is worth naming even though it scores nothing: without a
   * role analysis half the score simply does not exist, and a person looking at
   * the number deserves to know that before they rewrite anything.
   */
  const evidence = ats.checks.find((check) => check.label === "Evidence you can back, used");
  if (evidence && !evidence.applicable) {
    return { headline, lever: "Analyse a role to score this draft against it — half the score is waiting on that" };
  }

  /* Under a point of gain is not a lever, it is a nag. */
  return { headline, lever: best && best.gain >= 1 ? best.lever : null };
}

/*
 * What aiming a résumé at one advert was worth.
 *
 * The panel has always answered "how does this document read". It has never
 * answered "did tailoring it to this role change anything" — which is the
 * question somebody actually has after pressing the button, and the reason the
 * master résumé and the tailored draft never felt like one flow.
 *
 * Both documents are scored against the same analysis, so the difference is
 * like-for-like rather than two numbers from different questions. Shared by
 * the drafting route and the studio panel so the API and the page can never
 * report different gains for the same pair.
 */
export type TailoringGain = {
  /** The master résumé against this role, or null when there is no master. */
  before: number | null;
  /** The tailored draft against the same role. */
  after: number;
  /**
   * after − before, or null when there is nothing to compare against.
   *
   * Null rather than the raw score, because "there is no master" and "the
   * master scored zero" are different facts and a caller that treats an absent
   * comparison as a rise from nothing reports a gain that did not happen.
   */
  gain: number | null;
};

export function tailoringGain(
  masterText: string | null | undefined,
  draftText: string,
  analysis: RuleAnalysis | null,
): TailoringGain {
  const after = scoreAts(draftText, analysis).score;
  const master = (masterText ?? "").trim();
  if (!master) return { before: null, after, gain: null };

  const before = scoreAts(master, analysis).score;
  return { before, after, gain: after - before };
}
