import type { JobSearchQuery } from "@/lib/jobs/search-provider";

/*
 * A target role is a person's own phrasing ("Business Analyst / Junior
 * Consultant", "Risk & Cybersecurity Analyst"). A jobs API treats every word as
 * a required keyword, so the slash, ampersand and trailing alternatives match
 * almost nothing. Reduce it to the primary title: first "/"-segment, no
 * parentheticals or punctuation, capped to the first few words.
 */
export function toSearchKeywords(role: string): string {
  const primary = role.split("/")[0]
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return primary.split(" ").slice(0, 4).join(" ") || role.trim();
}

/*
 * The brief is applied as a hierarchy — country, then geography, then target
 * companies, then roles, then work model. This turns a saved brief into the
 * concrete list of provider queries, in priority order:
 *
 *   1. one query per priority role (top 3), scoped to country + first city;
 *   2. one query per target company (top 4), for the top role, scoped to country.
 *
 * Kept pure so the mapping from brief to queries is testable without a network.
 */
export const MAX_ROLE_QUERIES = 3;
export const MAX_COMPANY_QUERIES = 4;

export function planSearchQueries(input: {
  roles: string[];
  country: string;
  locations: string[];
  companies: string[];
  remotePreference: string | null;
}): JobSearchQuery[] {
  const remoteOnly = input.remotePreference === "Remote";
  const location = input.locations[0]?.trim() || undefined;
  const roles = input.roles.map(toSearchKeywords).filter(Boolean).slice(0, MAX_ROLE_QUERIES);
  const queries: JobSearchQuery[] = roles.map((keywords) => ({
    keywords, country: input.country, location, remoteOnly, limit: 20,
  }));
  const topRole = roles[0];
  if (topRole) {
    for (const employer of input.companies.slice(0, MAX_COMPANY_QUERIES)) {
      queries.push({ keywords: topRole, country: input.country, employer, remoteOnly, limit: 10 });
    }
  }
  return queries;
}
