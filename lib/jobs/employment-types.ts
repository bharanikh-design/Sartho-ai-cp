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
   * Words added to the query when neither provider can filter for it. A hint
   * is weaker than a filter, and the UI says so rather than implying parity.
   */
  queryHint?: string;
};

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  { id: "Full-time", adzunaParam: "full_time", jsearchValue: "FULLTIME" },
  { id: "Part-time", adzunaParam: "part_time", jsearchValue: "PARTTIME" },
  { id: "Contract", adzunaParam: "contract", jsearchValue: "CONTRACTOR" },
  { id: "Permanent", adzunaParam: "permanent" },
  { id: "Internship", jsearchValue: "INTERN", queryHint: "internship" },
  { id: "Graduate programme", queryHint: "graduate program" },
];

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

/** Words to fold into the query text for selections no provider can filter. */
export function employmentQueryHints(selected: string[]): string[] {
  return [...new Set(
    selected
      .map((id) => employmentType(id))
      .filter((type): type is EmploymentType => Boolean(type))
      // Only when the type has no filter of its own on either provider.
      .filter((type) => !type.jsearchValue && !type.adzunaParam && type.queryHint)
      .map((type) => type.queryHint as string),
  )];
}
