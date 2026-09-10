/*
 * How much experience the person has, as a band rather than a number.
 *
 * Nobody knows their own total to the year, and asking for one produces a
 * confident-looking figure that was a guess. Four bands is what a person can
 * answer honestly in two seconds, and it is enough to do the two things this
 * number is for:
 *
 *   - decide the seniority a title claim is allowed to support, and
 *   - drop adverts that demand more years than the person has.
 *
 * Those two use opposite ends of the band on purpose, and it is worth being
 * explicit about why. Seniority uses the bottom: a title inflates, years are
 * the check on it, and the check should assume the least the person claimed.
 * The experience filter uses the top: it removes roles from the page, so where
 * a band is ambiguous it should remove fewer. Both errors then point the same
 * way — toward showing a role the person can reach.
 */

export type ExperienceBandId = "0-1" | "2-5" | "5-10" | "10+";

export type ExperienceBand = {
  id: ExperienceBandId;
  /** What the person picks. */
  label: string;
  /** The fewest years somebody in this band has. */
  minYears: number;
  /** The most, or null for the open-ended top band. */
  maxYears: number | null;
  /**
   * Whether this person is early enough in their career that graduate and
   * entry-level postings are worth chasing as their own search pass.
   */
  earlyCareer: boolean;
  /** Said on the picker, so the choice is not a guess about what it does. */
  note: string;
};

export const EXPERIENCE_BANDS: ExperienceBand[] = [
  {
    id: "0-1",
    label: "0–1 years",
    minYears: 0,
    maxYears: 1,
    earlyCareer: true,
    note: "Graduate and entry-level postings get their own search pass, and roles asking for more than two years are left out.",
  },
  {
    id: "2-5",
    label: "2–5 years",
    minYears: 2,
    maxYears: 5,
    earlyCareer: false,
    note: "Roles asking for more than six years are left out.",
  },
  {
    id: "5-10",
    label: "5–10 years",
    minYears: 5,
    maxYears: 10,
    earlyCareer: false,
    note: "Roles asking for more than eleven years are left out.",
  },
  {
    id: "10+",
    label: "10+ years",
    minYears: 10,
    maxYears: null,
    earlyCareer: false,
    note: "No role is left out for asking too many years.",
  },
];

const byId = new Map(EXPERIENCE_BANDS.map((band) => [band.id, band]));

/** A stored band id, or null when nothing was ever chosen. */
export function normaliseExperienceBand(value: unknown): ExperienceBandId | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return byId.has(id as ExperienceBandId) ? (id as ExperienceBandId) : null;
}

export function experienceBand(id: unknown): ExperienceBand | null {
  const normalised = normaliseExperienceBand(id);
  return normalised ? byId.get(normalised) ?? null : null;
}

/*
 * The band a résumé's own total falls into, used to pre-fill the picker.
 *
 * The labels have a gap between one year and two, because those are the words
 * people recognise. The mapping does not: every year lands somewhere, and
 * eighteen months belongs with the graduates rather than nowhere.
 */
export function bandForYears(years: number | null | undefined): ExperienceBandId | null {
  if (typeof years !== "number" || !Number.isFinite(years) || years < 0) return null;
  if (years < 2) return "0-1";
  if (years < 5) return "2-5";
  if (years < 10) return "5-10";
  return "10+";
}

/**
 * The years to test an advert's demand against — the top of the band, because
 * this number takes roles off the page and should take fewer when unsure. The
 * open-ended band returns Infinity, so nothing is ever dropped for asking too
 * much of somebody with ten years or more.
 */
export function yearsForExperienceFilter(band: ExperienceBand): number {
  return band.maxYears ?? Number.POSITIVE_INFINITY;
}

/**
 * The years to judge a job title against — the bottom of the band, because
 * years exist here to temper an inflated title and should assume the least
 * the person claimed.
 */
export function yearsForSeniority(band: ExperienceBand): number {
  return band.minYears;
}

/*
 * What "just graduated" is called in each market.
 *
 * These are not synonyms a thesaurus would give. An Australian employer posts a
 * "graduate program", a British one a "graduate scheme", an Indian one asks for
 * "freshers", and an American one writes "entry level" or "new grad". Searching
 * the wrong market's word finds nothing and looks like there is nothing there,
 * which for the person this feature exists for is the whole problem.
 *
 * Sent as alternatives the provider may OR together, never as extra required
 * words: a term a provider does not recognise then costs nothing, where an
 * extra required word would empty the page.
 */
const ENTRY_LEVEL_TERMS: Record<string, string[]> = {
  au: ["graduate program", "vacationer", "graduate", "entry level", "internship", "cadet"],
  nz: ["graduate program", "graduate", "entry level", "internship"],
  gb: ["graduate scheme", "graduate programme", "industrial placement", "spring week", "internship"],
  ie: ["graduate programme", "graduate", "entry level", "internship"],
  us: ["new grad", "campus hire", "entry level", "university graduate", "internship", "summer analyst"],
  ca: ["new grad", "campus hire", "entry level", "university graduate", "internship"],
  in: ["fresher", "graduate trainee", "campus recruitment", "management trainee", "entry level", "internship"],
  ae: ["fresh graduate", "graduate program", "graduate development program", "national graduate", "internship"],
  sa: ["fresh graduate", "graduate development program", "graduate program", "entry level", "internship"],
  de: ["trainee", "werkstudent", "graduate program", "junior", "praktikum"],
  fr: ["stage", "alternance", "jeune diplome", "graduate program"],
  nl: ["traineeship", "starter", "graduate program", "stage", "junior"],
  sg: ["management trainee", "graduate program", "entry level", "internship"],
};

const DEFAULT_ENTRY_LEVEL_TERMS = ["graduate", "entry level", "internship"];

export function entryLevelTermsFor(country: string | null | undefined): string[] {
  const code = (country ?? "").trim().toLowerCase();
  return ENTRY_LEVEL_TERMS[code] ?? DEFAULT_ENTRY_LEVEL_TERMS;
}
