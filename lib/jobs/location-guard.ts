/*
 * Cross-border location guard and market consistency checks.
 *
 * Aggregators like Adzuna periodically misindex overseas postings — e.g. mapping
 * "Jupiter, Florida (Palm Beach County)" to "Palm Beach, Pittwater Area, NSW" in
 * Australia because of colliding suburb names.
 *
 * This guard identifies explicit foreign geographic markers in job titles,
 * employers, and location fields to prevent cross-continent contamination.
 */

const JUNK_EMPLOYER_PATTERNS = [
  /^job details?$/i,
  /^job description$/i,
  /^employer not (?:specified|listed)$/i,
  /^not (?:specified|disclosed)$/i,
  /^confidential(?: employer)?$/i,
  /^company confidential$/i,
  /^hiring organization$/i,
  /^company details?$/i,
  /^(?:full|part)[ -]time$/i,
];

/** Check if an employer string is a generic scraper placeholder rather than a company. */
export function isJunkEmployer(name: string | null | undefined): boolean {
  if (!name) return false;
  const clean = name.trim();
  if (!clean || clean.length < 2) return true;
  return JUNK_EMPLOYER_PATTERNS.some((pattern) => pattern.test(clean));
}

/** Clean an employer name, replacing scraper artifacts with null. */
export function sanitizeEmployer(name: string | null | undefined): string | null {
  if (!name) return null;
  const clean = name.trim();
  return isJunkEmployer(clean) ? null : clean;
}

// US State abbreviations (excluding two-letter codes that collide with other countries or states)
// E.g., for AU, WA = Western Australia and SA = South Australia, so WA/SA are handled per-country.
const US_STATE_CODES_GENERAL = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WV", "WI", "WY", "DC",
];

const US_STATE_NAMES = [
  "Florida", "California", "Texas", "Ohio", "Michigan", "Georgia",
  "North Carolina", "Virginia", "Pennsylvania", "Illinois", "New York",
  "Massachusetts", "Washington DC", "United States", "USA", "U.S.A.",
];

/**
 * Check if a job listing contains explicit foreign markers for the target country.
 * Returns true if the listing is consistent with the market, false if it belongs to another country.
 */
export function isMarketLocationConsistent(
  match: { title: string; location?: string | null; employer?: string | null; description?: string },
  targetCountry: string,
): boolean {
  const country = targetCountry.trim().toLowerCase();
  const title = match.title || "";
  const location = match.location || "";
  const employer = match.employer || "";

  // If the target is US, US markers are expected.
  if (country === "us") return true;

  // Non-US target markets (e.g. au, gb, in, sg, nz, ae, de, fr):
  // Check for explicit US state/country signatures in title, location, or employer.

  // 1. Detect US state suffix in title: e.g. ", FL", "- Jupiter, FL", "(Austin, TX)"
  const statePattern = new RegExp(
    `(?:,\\s*|\\s*-\\s*|\\(\\s*|\\[\\s*)(?:${US_STATE_CODES_GENERAL.join("|")})(?:\\s*[,)\\]]|\\s*$)`,
    "i",
  );

  if (statePattern.test(title)) return false;

  // 2. Detect US State names in title or employer (e.g. "University of Florida", "State of California")
  for (const stateName of US_STATE_NAMES) {
    const nameRegex = new RegExp(`\\b${stateName}\\b`, "i");
    // Employer: "University of Florida"
    if (employer && nameRegex.test(employer) && /university|college|state of|county of/i.test(employer)) {
      return false;
    }
    // Title explicitly naming foreign state: e.g. "Analyst - Florida" or "Associate in Texas"
    if (new RegExp(`(?:in|at|-|,)\\s+${stateName}\\b`, "i").test(title)) {
      return false;
    }
  }

  // 3. Detect obvious mismatch if location text explicitly ends in USA or foreign country
  if (/\b(?:USA|United States|U\.S\.A\.)\b/i.test(location) && country !== "us") {
    return false;
  }
  if (/\b(?:Australia|NSW|VIC|QLD|WA|SA|TAS|ACT)\b/i.test(location) && country === "gb") {
    return false;
  }

  return true;
}

/**
 * Deduplicates search results smartly:
 * 1. Groups by normalized title and normalized city.
 * 2. When duplicate entries exist, chooses the highest fidelity card
 *    (prefers verified employer over junk employer, direct apply, and higher match score).
 */
export function deduplicateSearchResults<T extends {
  title: string;
  employer: string | null;
  location: string | null;
  overallMatch?: number;
  applyDirect?: boolean;
  description?: string;
}>(results: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of results) {
    const cleanEmp = sanitizeEmployer(item.employer);
    const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    const normLoc = (item.location || "")
      .toLowerCase()
      .split(",")[0]
      ?.replace(/[^a-z0-9]/g, " ")
      .trim() || "";

    // A composite key based on title + location locality
    const compositeKey = normLoc ? `${normTitle}::${normLoc}` : `${normTitle}::${cleanEmp ?? ""}`;

    const existing = map.get(compositeKey);
    if (!existing) {
      map.set(compositeKey, cleanEmp !== item.employer ? { ...item, employer: cleanEmp } : item);
      continue;
    }

    // Determine which duplicate is higher fidelity:
    const existingHasEmp = Boolean(sanitizeEmployer(existing.employer));
    const newHasEmp = Boolean(cleanEmp);

    if (!existingHasEmp && newHasEmp) {
      // Replace existing junk employer with new real employer
      map.set(compositeKey, { ...item, employer: cleanEmp });
    } else if (item.applyDirect && !existing.applyDirect) {
      // Replace aggregator listing with direct apply link
      map.set(compositeKey, cleanEmp !== item.employer ? { ...item, employer: cleanEmp } : item);
    } else if ((item.overallMatch ?? 0) > (existing.overallMatch ?? 0)) {
      // Retain higher match score
      map.set(compositeKey, cleanEmp !== item.employer ? { ...item, employer: cleanEmp } : item);
    }
  }

  return Array.from(map.values());
}
