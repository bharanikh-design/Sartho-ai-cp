/*
 * The house writing standard for a résumé line, and the public guidance it
 * comes from.
 *
 * These rules were prose inside MASTER_RESUME_RULES, which meant they applied
 * to exactly one of the three routes that write résumé lines. The tailored
 * draft — the document somebody actually sends to an employer — was told only
 * not to invent, and then scored by an ATS panel that marks it down for weak
 * openers and passive voice nobody ever asked it to avoid. A tool that grades
 * a rule it never stated is not coaching, it is a trap.
 *
 * So the standard lives here once: stated to the model in RESUME_WRITING_RULES,
 * and checked afterwards by the same patterns the score uses. A rule that is
 * only in a prompt is a wish.
 *
 * The guidance is not invented. It is what career services and hiring-side
 * sources agree on, and they agree closely:
 *
 *   Harvard FAS Mignone Center for Career Success, "Create a Strong Resume" —
 *   begin each line with a strong action verb; remove "responsible for" and
 *   "duties"; no personal pronouns, each line a phrase rather than a full
 *   sentence; quantify where possible.
 *   https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/
 *
 *   MIT Career Advising & Professional Development, "Resume action verbs" —
 *   the action-verb vocabulary, grouped by what the verb claims.
 *   https://capd.mit.edu/resources/resume-action-verbs/
 *
 *   Indeed Career Guide, "Words To Avoid and Include on a Resume", and the
 *   same finding from Teal and ResumeTemplates: the words to cut are
 *   self-descriptions — "results-driven", "team player", "detail-oriented" —
 *   which any candidate can claim and no reader can check.
 *   https://www.indeed.com/career-advice/resumes-cover-letters/words-to-avoid-and-include-on-a-resume
 *
 * What Sartho does NOT take from them is "quantify where possible" read as
 * "every line needs a percentage". That reading is why the coach had one note
 * for every bullet on a twenty-year career, and it is wrong twice: a figure
 * nobody gave is an invention, and a line naming real scope — four business
 * units, three countries, an eleven-person team — is strong without one.
 */

/*
 * Openers that describe a job description rather than a person's work.
 *
 * "Responsible for" is the one every source names. The rest are the same
 * move: a verb that reports proximity to work instead of doing it.
 */
export const WEAK_OPENER =
  /^(?:worked|helped|assisted|responsible for|duties included|handled|did|made|participated|involved in|tasked with|supported)\b/i;

/*
 * "Incident volume was cut" puts the work at a distance from the person.
 *
 * The irregular participles are listed because the -ed test alone misses every
 * one of them, and they are the participles a senior career is written in:
 * built, led, cut, run, rebuilt, overseen, driven, taken. "Incident volume was
 * cut by the new triage model" is as passive as a line gets and slipped
 * through the check for as long as it has existed, so the panel's active-voice
 * figure was reporting on regular verbs only.
 */
const IRREGULAR_PARTICIPLE = [
  "built", "rebuilt", "led", "cut", "run", "overrun", "made", "sent", "kept", "held", "built-out",
  "taken", "undertaken", "given", "driven", "written", "rewritten", "seen", "overseen", "done",
  "redone", "brought", "bought", "sought", "taught", "won", "begun", "drawn", "withdrawn", "grown",
  "known", "shown", "thrown", "spent", "left", "lost", "found", "met", "set", "reset", "put", "read",
  "chosen", "broken", "spoken", "risen", "fallen", "dealt", "built-in",
].join("|");

export const PASSIVE_VOICE = new RegExp(
  `\\b(?:was|were|is|are|am|be|been|being)\\b\\s+(?:\\w+ed|${IRREGULAR_PARTICIPLE})\\b`,
  "i",
);

/** A résumé line is a phrase, not a sentence somebody is narrating. */
export const FIRST_PERSON = /\b(?:I|I'm|I've|me|my|mine|we|we're|our|ours)\b/i;

/*
 * Claims a reader cannot check, which is why every candidate makes them.
 *
 * Ordered longest-first where one contains another ("proven track record"
 * before "proven"), so the phrase a person actually wrote is the one reported
 * back to them.
 */
export const UNVERIFIABLE_SELF_DESCRIPTION = [
  "proven track record",
  "excellent communicator",
  "strong communicator",
  "think outside the box",
  "outside the box",
  "results-driven",
  "results-oriented",
  "detail-oriented",
  "detail oriented",
  "customer-focused",
  "self-starter",
  "go-getter",
  "team player",
  "hard-working",
  "hard working",
  "hardworking",
  "highly motivated",
  "value-add",
  "best-in-class",
  "world-class",
  "synergy",
  "synergies",
  "dynamic",
  "passionate",
  "visionary",
  "guru",
  "ninja",
  "rockstar",
  "rock star",
  "thought leader",
] as const;

function escapeForPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Built once from the list above rather than written out twice, so a phrase
 * added to the list is immediately one the check catches and the model is told
 * about. Hyphens and spaces are treated alike — somebody who writes "detail
 * oriented" meant "detail-oriented".
 */
const UNVERIFIABLE_SOURCE = UNVERIFIABLE_SELF_DESCRIPTION
  .map((phrase) => escapeForPattern(phrase).replace(/[\s-]+/g, "[\\s-]+"))
  .join("|");

/** A fresh regex per call: a /g pattern carries lastIndex between uses. */
function unverifiablePattern() {
  return new RegExp(`\\b(?:${UNVERIFIABLE_SOURCE})\\b`, "gi");
}

/** Every unverifiable self-description in one line, as the person wrote it. */
export function unverifiableClaimsIn(text: string): string[] {
  const found = text.match(unverifiablePattern()) ?? [];
  const seen = new Set<string>();
  return found.filter((phrase) => {
    const key = phrase.toLowerCase().replace(/[\s-]+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/*
 * The opening word, for spotting a résumé that led with "Managed" six times.
 *
 * Repetition is the one rule on this list a reader feels before they can name
 * it: the page stops reading like a career and starts reading like a form.
 */
export function openingVerb(text: string): string {
  return (text.trim().match(/^[A-Za-z'-]+/)?.[0] ?? "").toLowerCase();
}

/**
 * Verbs opening more lines than the limit allows, commonest first.
 *
 * Scoped by the caller: two bullets in one job opening on "Led" is fine and
 * reads as a theme, where six across the document reads as a vocabulary of
 * one. So the caller passes one role's bullets, or the whole document, and
 * chooses the limit that goes with it.
 */
export function overusedOpeners(bullets: string[], limit: number): Array<{ verb: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bullet of bullets) {
    const verb = openingVerb(bullet);
    if (!verb) continue;
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > limit)
    .map(([verb, count]) => ({ verb, count }))
    .sort((a, b) => b.count - a.count || a.verb.localeCompare(b.verb));
}

export type WritingFinding = {
  kind: "weak-opener" | "passive" | "unverifiable" | "first-person" | "long";
  /** Index in the bullets passed in, so the caller can point at the line. */
  index: number;
  /** What to say about it, in the second person, without scolding. */
  detail: string;
};

/*
 * A bullet longer than this is a paragraph.
 *
 * Roughly two printed lines at résumé width. Chosen in characters rather than
 * words because it is the visual length that stops a line being read, and a
 * reader skipping it loses the whole claim, not the tail of it.
 */
export const LONG_BULLET_CHARS = 240;

/**
 * Everything about these lines a person would want to fix before sending.
 *
 * Reports rather than rewrites. The rewrite belongs to the route that has the
 * evidence in front of it; this only has the text, and a fix written from the
 * text alone is how a tool ends up inventing the figure it is complaining is
 * missing.
 */
export function reviewWriting(bullets: string[]): WritingFinding[] {
  const findings: WritingFinding[] = [];

  bullets.forEach((raw, index) => {
    const text = raw.replace(/^[•\-*]\s*/, "").trim();
    if (!text) return;

    if (WEAK_OPENER.test(text)) {
      findings.push({
        kind: "weak-opener",
        index,
        detail: `Opens on "${openingVerb(text)}", which reports being near the work. Say what you did.`,
      });
    }
    if (PASSIVE_VOICE.test(text)) {
      findings.push({ kind: "passive", index, detail: "Written in the passive voice, which puts the work at a distance from you." });
    }
    for (const phrase of unverifiableClaimsIn(text)) {
      findings.push({ kind: "unverifiable", index, detail: `"${phrase}" is a claim no reader can check. State what you did instead.` });
    }
    if (FIRST_PERSON.test(text)) {
      findings.push({ kind: "first-person", index, detail: "A résumé line is a phrase, not a sentence about yourself. Drop the pronoun." });
    }
    if (text.length > LONG_BULLET_CHARS) {
      findings.push({ kind: "long", index, detail: `${text.length} characters — long enough to be skipped rather than read. Two lines is the limit.` });
    }
  });

  return findings;
}

/*
 * What every route that writes a résumé line is told.
 *
 * One string, so the master résumé, the tailored draft and the single-bullet
 * rewrite cannot drift apart on what good looks like — and so the panel that
 * scores the result is scoring the thing that was actually asked for.
 */
export const RESUME_WRITING_RULES = [
  "Write each line the way a person speaks to a hiring manager: what they did, at what scope, and what came of it.",
  "Open every bullet on a real action — led, cut, built, negotiated, migrated, rebuilt, consolidated — never on 'responsible for', 'duties included', 'helped with', 'assisted with', 'worked on', 'involved in' or 'tasked with'.",
  "Use the active voice throughout. 'Cut incident volume' rather than 'incident volume was cut'.",
  "No first-person pronouns. A résumé line is a phrase, not a sentence narrating yourself.",
  /*
   * The whole list, not a sample of it. This was sliced to twelve to keep the
   * prompt short, which quietly put the instruction and the check out of step:
   * the panel flagged thirty phrases and the model had been warned about
   * twelve. Thirty short phrases is nothing against a résumé's worth of
   * evidence, and one source is the entire point of this module.
   */
  `Never describe the person with a claim no reader could verify: ${UNVERIFIABLE_SELF_DESCRIPTION.join(", ")}. State what they did instead.`,
  "Do not open more than two bullets in the same role with the same verb, and do not repeat a distinctive phrase across roles. Vary the verb to fit the work, not to sound varied.",
  "A figure is welcome where the evidence states one, and never invented where it does not. A line naming real scope — four business units, three countries, an eleven-person team — is strong without a percentage, and a line padded with a number nobody gave is worse than one without.",
  `Keep each bullet to one or two lines, under ${LONG_BULLET_CHARS} characters. A bullet longer than that is a paragraph and will not be read.`,
  "Present tense for a role still held, past tense for every other.",
  "Keep the person's own register. Do not translate plain work into consultancy vocabulary, and do not add a closing flourish about impact the evidence does not support.",
].join(" ");
