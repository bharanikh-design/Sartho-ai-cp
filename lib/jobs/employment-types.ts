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
};

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  { id: "Full-time", adzunaParam: "full_time", jsearchValue: "FULLTIME", queryHint: "full time" },
  { id: "Part-time", adzunaParam: "part_time", jsearchValue: "PARTTIME", queryHint: "part time" },
  { id: "Contract", adzunaParam: "contract", jsearchValue: "CONTRACTOR", queryHint: "contract" },
  { id: "Permanent", adzunaParam: "permanent", queryHint: "permanent" },
  { id: "Internship", jsearchValue: "INTERN", queryHint: "internship" },
  { id: "Graduate programme", queryHint: "graduate program" },
];

export type ProviderName = "adzuna" | "jsearch";

/** Whether this provider can filter for a type, rather than only hint at it. */
export function canFilter(type: EmploymentType, provider: ProviderName): boolean {
  return provider === "adzuna" ? Boolean(type.adzunaParam) : Boolean(type.jsearchValue);
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

export function filterableSelections(selected: string[], provider: ProviderName): string[] {
  return selected.filter((id) => {
    const type = employmentType(id);
    return type ? canFilter(type, provider) : false;
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
  return [...new Set(
    selected
      .map((id) => employmentType(id)?.adzunaParam)
      .filter((param): param is NonNullable<typeof param> => Boolean(param)),
  )];
}

/** Words to fold into the query text for selections THIS provider cannot filter. */
export function employmentQueryHints(selected: string[], provider: ProviderName): string[] {
  return [...new Set(
    selected
      .map((id) => employmentType(id))
      .filter((type): type is EmploymentType => Boolean(type))
      .filter((type) => !canFilter(type, provider))
      .map((type) => type.queryHint),
  )];
}
