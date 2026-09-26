/*
 * Type of work, as the major boards ask it.
 *
 * Indeed, Seek and LinkedIn all filter on this, and so do both of Sartho's
 * providers — so it is a real narrowing of the search rather than a control
 * that only looks like one. Each entry says exactly how it reaches each
 * provider; where a provider has no equivalent, that is written down instead
 * of quietly ignored.
 */

export type EmploymentType = {
  /** What the person picks. */
  id: string;
  /** Adzuna's boolean parameter, when it has one. */
  adzunaParam?: "full_time" | "part_time" | "contract" | "permanent";
  /** JSearch's employment_types value, when it has one. */
  jsearchValue?: "FULLTIME" | "PARTTIME" | "CONTRACTOR" | "INTERN";
  /**
   * Words folded into the query text when THIS provider cannot filter for it.
   *
   * It used to be "when neither provider can filter for it", which quietly
   * threw selections away. Internship has a JSearch filter, so it was excluded
   * from the hints — and on an Adzuna-only search, which is what actually runs,
   * Adzuna has no internship parameter and never saw the word either. Same for
   * Permanent in reverse: an Adzuna flag, nothing at all on JSearch. Two of a
   * person's four selections did nothing, and the brief said they had.
   *
   * A hint is weaker than a filter, and the UI says which one each got.
   */
  queryHint: string;
  /*
   * Google's own words for this working pattern, as it reports them on a
   * listing's `detected_extensions.schedule_type`.
   *
   * This is how SerpApi narrows: not by a request parameter, which it has
   * none of, but by reading the pattern back off each result. It lives here
   * rather than in serpapi.ts so that the thing deciding what to filter and
   * the thing *reporting* what was filtered cannot drift apart — which is
   * exactly how the report came to say "hint" about a real filter.
   *
   * Matched loosely because the spelling varies by market and a hyphen
   * should not lose somebody a job.
   */
  serpapiSchedule?: string[];
};

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  { id: "Full-time", adzunaParam: "full_time", jsearchValue: "FULLTIME", queryHint: "full time", serpapiSchedule: ["full time", "fulltime", "permanent"] },
  { id: "Part-time", adzunaParam: "part_time", jsearchValue: "PARTTIME", queryHint: "part time", serpapiSchedule: ["part time", "parttime"] },
  { id: "Contract", adzunaParam: "contract", jsearchValue: "CONTRACTOR", queryHint: "contract", serpapiSchedule: ["contract", "contractor", "temporary", "temp"] },
  { id: "Permanent", adzunaParam: "permanent", queryHint: "permanent", serpapiSchedule: ["permanent", "full time", "fulltime"] },
  { id: "Internship", jsearchValue: "INTERN", queryHint: "internship", serpapiSchedule: ["intern", "internship"] },
  { id: "Graduate programme", queryHint: "graduate program", serpapiSchedule: ["intern", "internship", "graduate"] },
];

export type ProviderName = "adzuna" | "jsearch" | "serpapi";

/**
 * Whether this provider can filter for a type, rather than only hint at it.
 *
 * SerpApi cannot, and the claim that it could cost a whole search. It reads
 * the same Google for Jobs index as JSearch, so it looked obvious that it must
 * take the same employment vocabulary — but JSearch exposes a field of its own
 * and SerpApi exposes Google's `chips`, which is not a field at all. A chip is
 * an opaque token Google mints for one particular search and hands back in
 * that response; it cannot be composed by a caller, and a chip Google never
 * issued returns nothing rather than an error.
 *
 * So for SerpApi this is always false, and the selection reaches Google as
 * words in the query instead. A hint is weaker than a filter, and saying which
 * one each provider gave is the entire job of this function.
 */
export function canFilter(type: EmploymentType, provider: ProviderName): boolean {
  if (provider === "serpapi") return false;
  return provider === "adzuna" ? Boolean(type.adzunaParam) : Boolean(type.jsearchValue);
}

/**
 * Whether the provider really narrows the results on this type, by any means.
 *
 * `canFilter` answers a narrower question — can it be asked for in the request
 * — and that is the right question for query hints. It is the wrong question
 * for telling a person what happened to their search, and using it for both
 * made the report exactly backwards for SerpApi.
 *
 * SerpApi cannot ask Google to filter, so `canFilter` is false and the brief
 * called every selection a hint. But `keepScheduleTypes` then removes every
 * listing whose reported schedule disagrees — a real filter, applied after the
 * results come back, and the strictest treatment any of the three providers
 * gives. A person who ticked Contract was told it was only a hint while their
 * results were being filtered on it.
 */
export function narrowsResults(type: EmploymentType, provider: ProviderName): boolean {
  if (provider === "serpapi") return Boolean(type.serpapiSchedule?.length);
  return canFilter(type, provider);
}

/** Google's schedule words for a selection, for the post-filter in serpapi.ts. */
export function serpapiScheduleWords(selected: string[]): string[] {
  return [...new Set(
    selected.flatMap((id) => employmentType(id)?.serpapiSchedule ?? []),
  )];
}

/*
 * Early-career types are the ones with no filter anywhere useful, and they sit
 * badly beside the others: Adzuna ANDs its flags, so full_time=1 and
 * permanent=1 exclude exactly the internships and graduate programmes a person
 * asked for in the same breath. Selecting all four returned neither.
 */
export const EARLY_CAREER_TYPES = ["Internship", "Graduate programme"];

export function earlyCareerSelections(selected: string[]): string[] {
  return selected.filter((id) => EARLY_CAREER_TYPES.some((early) => early.toLowerCase() === id.trim().toLowerCase()));
}

/**
 * The selections this provider will really narrow on, given the whole set.
 *
 * Asked per selection, this over-reported. Adzuna treats contract=1 and
 * permanent=1 as mutually exclusive and 400s on both, so adzunaEmploymentParams
 * drops the pair — and somebody who ticked Contract and Permanent had two
 * selections reported to them as applied filters while the request carried
 * neither. Reading the params that are actually sent keeps the criteria honest
 * about what narrowed the search.
 */
export function filterableSelections(selected: string[], provider: ProviderName): string[] {
  if (provider === "adzuna") {
    const sent = new Set(adzunaEmploymentParams(selected));
    return selected.filter((id) => {
      const param = employmentType(id)?.adzunaParam;
      return Boolean(param && sent.has(param));
    });
  }

  return selected.filter((id) => {
    const type = employmentType(id);
    return type ? narrowsResults(type, provider) : false;
  });
}

const byId = new Map(EMPLOYMENT_TYPES.map((type) => [type.id.toLowerCase(), type]));

export function employmentType(id: string): EmploymentType | null {
  return byId.get(id.trim().toLowerCase()) ?? null;
}

export function isEmploymentType(id: string): boolean {
  return byId.has(id.trim().toLowerCase());
}

/** The JSearch employment_types value for a selection, or null when none applies. */
export function jsearchEmploymentTypes(selected: string[]): string | null {
  const values = selected
    .map((id) => employmentType(id)?.jsearchValue)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  return values.length ? [...new Set(values)].join(",") : null;
}

/** Adzuna's boolean flags for a selection. */
export function adzunaEmploymentParams(selected: string[]): string[] {
  const params = [...new Set(
    selected
      .map((id) => employmentType(id)?.adzunaParam)
      .filter((param): param is NonNullable<typeof param> => Boolean(param)),
  )];

  // Adzuna treats contract=1 and permanent=1 as mutually exclusive. Sending both returns 400 Bad Request.
  // When a candidate is open to both contract and permanent work, omit the conflicting contract-type flags.
  if (params.includes("contract") && params.includes("permanent")) {
    return params.filter((param) => param !== "contract" && param !== "permanent");
  }
  return params;
}

/** Words to fold into the query text for selections THIS provider cannot filter. */
export function employmentQueryHints(selected: string[], provider: ProviderName): string[] {
  /*
   * Never for SerpApi, and this is a guard rather than an accident of the
   * data. Appending "full time" to a SerpApi query has already killed the
   * entire search once: Google matches every added term, so
   * "Servicenow Delivery Director full time" is a four-term match against a
   * title that is rare to begin with, and Google answered with nothing at all.
   * SerpApi narrows on schedule after the results instead — see
   * narrowsResults above — so it needs neither a parameter nor a word.
   */
  if (provider === "serpapi") return [];

  return [...new Set(
    selected
      .map((id) => employmentType(id))
      .filter((type): type is EmploymentType => Boolean(type))
      .filter((type) => !canFilter(type, provider))
      .map((type) => type.queryHint),
  )];
}
