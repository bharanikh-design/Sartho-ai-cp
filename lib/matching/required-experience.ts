/*
 * How many years an advert actually demands.
 *
 * This is the filter that decides whether somebody fresh out of university
 * stays or gives up. A graduate searching "Business Analyst" gets a page that
 * is mostly roles wanting five to eight years, and after the third screen of
 * those they conclude the tool does not work and go back to LinkedIn — where
 * they will scroll past exactly the same postings, but at least expect to.
 *
 * A title filter cannot catch it. "Analyst", "Consultant" and "Engineer" carry
 * no seniority word at all, and plenty of postings titled "Analyst" open with
 * "6+ years' experience required". The only place that requirement is written
 * down is the description, so that is where it is read from.
 *
 * The rule throughout: read what is written, and when nothing is written, say
 * nothing. A role that never states a requirement is not an entry-level role
 * and is not a senior one — it is a role that did not say, and guessing either
 * way would be exactly the invention this product refuses everywhere else.
 */

export type RequiredExperience = {
  /** The fewest years the advert asks for, or null when it does not say. */
  minYears: number | null;
  /** The phrase it was read from, so a person can check the working. */
  evidence: string | null;
  /**
   * Whether the advert positively welcomes people starting out — a graduate
   * programme, an internship, "no experience required". Separate from minYears
   * because "does not demand experience" and "invites beginners" are different
   * claims, and only the second is worth surfacing to somebody who has none.
   */
  entryFriendly: boolean;
};

/*
 * Words that turn a number of years into a requirement about a person.
 *
 * Without one of these nearby, "5 years" is just as likely to be "founded 5
 * years ago", "a 3 year degree" or "5 years of double-digit growth" — all of
 * which appear in adverts constantly, and none of which say anything about who
 * may apply.
 */
const EXPERIENCE_WORD = /experience|exp\b|background|track record|hands.on|working in|in a similar|in the field|professional/i;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};

/*
 * A quantity of years, in the shapes adverts actually write them: "5+ years",
 * "5-7 years", "at least three years", "minimum of 5 yrs", "3 years'".
 *
 * The leading group deliberately allows "at least", "minimum of" and friends to
 * sit in front without being required, because roughly half of postings use one
 * and half do not.
 */
const YEARS_PATTERN = new RegExp(
  String.raw`(?:(?:at\s+least|minimum\s+(?:of\s+)?|min\.?\s*|over|more\s+than)\s+)?` +
  String.raw`(\d{1,2}|${Object.keys(WORD_NUMBERS).join("|")})` +
  String.raw`\s*(?:\+|plus|or\s+more)?` +
  String.raw`(?:\s*(?:-|–|—|to)\s*\d{1,2})?` +
  String.raw`\s*(?:\+)?\s*(?:years?|yrs?)\b['’]?`,
  "gi",
);

/*
 * An advert that says outright it is for people starting out.
 *
 * "0-2 years" is included because it is how a great many graduate postings say
 * it, and reading it only as "requires 0 years" would file it beside every
 * other role that happens to state no minimum.
 */
const ENTRY_FRIENDLY = new RegExp([
  String.raw`no\s+(?:prior\s+|previous\s+|professional\s+)?experience\s+(?:is\s+)?(?:required|necessary|needed)`,
  String.raw`graduate\s+(?:programme|program|scheme|role|position|opportunit)`,
  String.raw`\bfresh\s+graduate`,
  String.raw`\bfreshers?\b`,
  String.raw`\bentry[\s-]level\b`,
  String.raw`\binternship\b`,
  String.raw`\bintern\b`,
  String.raw`\btrainee\b`,
  String.raw`\bapprentice`,
  String.raw`\bcampus\s+hire`,
  String.raw`recent\s+graduates?`,
  String.raw`\b0\s*(?:-|–|to)\s*[12]\s*years?`,
  /*
   * Joined explicitly. Handing the array itself to RegExp stringifies it with
   * commas, producing one literal pattern that matches nothing — silently, and
   * in the direction that filters graduates out of graduate programmes.
   */
].join("|"), "i");

/** The window either side of a number in which an experience word still counts. */
const NEAR = 48;

export function requiredExperienceIn(description: string): RequiredExperience {
  const text = (description ?? "").replace(/\s+/g, " ");
  if (!text) return { minYears: null, evidence: null, entryFriendly: false };

  const entryFriendly = ENTRY_FRIENDLY.test(text);

  let minYears: number | null = null;
  let evidence: string | null = null;

  /*
   * A fresh regex per call. A /g pattern carries lastIndex between calls, and
   * reusing one across descriptions silently skips every other advert — the
   * same bug the ATS reader had, worth not repeating.
   */
  const pattern = new RegExp(YEARS_PATTERN.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1].toLowerCase();
    const years = /^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw];
    if (years === undefined || years > 40) continue;

    /*
     * The number has to be talking about a person. Looked for on both sides,
     * because both "5 years of experience" and "experience: 5 years" are
     * ordinary, as is "experienced professional with 5 years".
     */
    const around = text.slice(Math.max(0, match.index - NEAR), match.index + match[0].length + NEAR);
    if (!EXPERIENCE_WORD.test(around)) continue;

    /*
     * The lowest stated figure, not the first or the highest. An advert that
     * says "3-5 years" in one place and "8 years for the senior track" in
     * another is open to somebody with three.
     */
    if (minYears === null || years < minYears) {
      minYears = years;
      evidence = match[0].trim();
    }
  }

  return { minYears, evidence, entryFriendly };
}

/*
 * Whether this advert is out of reach on stated experience alone.
 *
 * Deliberately generous by a year. Requirements are written as a wish rather
 * than a rule, everybody in hiring knows it, and a graduate who never sees a
 * role asking for two years is being protected out of the opportunities they
 * would actually have got. What this exists to remove is the eight-years-plus
 * wall, not the near miss.
 *
 * And an advert that welcomes beginners is never filtered, whatever number
 * appears elsewhere in it — a graduate programme mentioning "two years of
 * rotations" is not asking for two years of experience.
 */
export const EXPERIENCE_STRETCH_YEARS = 1;

export function demandsMoreExperience(required: RequiredExperience, candidateYears: number): boolean {
  if (required.entryFriendly) return false;
  if (required.minYears === null) return false;
  return required.minYears > candidateYears + EXPERIENCE_STRETCH_YEARS;
}
