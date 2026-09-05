import type { JobSearchQuery } from "@/lib/jobs/search-provider";
import { marketTitleIn } from "@/lib/matching/job-family";

/*
 * A target role is a person's own phrasing ("Business Analyst / Junior
 * Consultant", "Risk & Cybersecurity Analyst"). A jobs API treats every word as
 * a required keyword, so the slash, ampersand and trailing alternatives match
 * almost nothing. Reduce it to the primary title: first "/"-segment, no
 * parentheticals or punctuation, capped to the first few words.
 */
export function toSearchKeywords(role: string): string {
  /*
   * Ask for a title employers actually post.
   *
   * Career Direction names roles the way a person thinks about them — "Risk
   * Cybersecurity Analyst", "Strategy Operations Analyst" — and those went to
   * the provider verbatim. No employer advertises either string, so a search
   * across three target roles came back with about twenty listings, two of
   * which survived filtering. Where the name contains a real market title, that
   * is what gets searched; where it does not, the old trimming stands.
   */
  const market = marketTitleIn(role);
  if (market && market.split(" ").length > 1) return market;

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
 *   1. the top role in each of the first two cities (or nationwide when none);
 *   2. the next priority roles (up to 3 in total) in the first city;
 *   3. one query per target company (top 4), for the top role, country-wide.
 *
 * Kept pure so the mapping from brief to queries is testable without a network.
 */
export const MAX_ROLE_QUERIES = 3;
export const MAX_LOCATION_QUERIES = 2;
export const MAX_COMPANY_QUERIES = 4;

export function planSearchQueries(input: {
  roles: string[];
  country: string;
  locations: string[];
  companies: string[];
  remotePreference: string | null;
  employmentTypes?: string[];
}): JobSearchQuery[] {
  const remoteOnly = input.remotePreference === "Remote";
  const employmentTypes = input.employmentTypes?.length ? input.employmentTypes : undefined;
  const locations = input.locations.map((item) => item.trim()).filter(Boolean).slice(0, MAX_LOCATION_QUERIES);
  const primaryLocation = locations[0];
  const roles = input.roles.map(toSearchKeywords).filter(Boolean).slice(0, MAX_ROLE_QUERIES);
  const queries: JobSearchQuery[] = [];
  const topRole = roles[0];
  if (!topRole) return queries;

  // The top role gets every city; a second city is where most "expand my
  // radius" asks actually land, and one extra query is affordable.
  if (locations.length) {
    for (const location of locations) {
      queries.push({ keywords: topRole, country: input.country, location, remoteOnly, employmentTypes, limit: 20 });
    }
  } else {
    queries.push({ keywords: topRole, country: input.country, remoteOnly, employmentTypes, limit: 20 });
  }
  for (const keywords of roles.slice(1)) {
    queries.push({ keywords, country: input.country, location: primaryLocation, remoteOnly, employmentTypes, limit: 20 });
  }
  for (const employer of input.companies.slice(0, MAX_COMPANY_QUERIES)) {
    queries.push({ keywords: topRole, country: input.country, employer, remoteOnly, employmentTypes, limit: 10 });
  }
  return queries;
}

/**
 * The queries to add when the cities came back thin: every role again, with no
 * city, so the rest of the country is covered. Company queries are already
 * country-wide and are not repeated.
 */
export function widenToCountry(queries: JobSearchQuery[]): JobSearchQuery[] {
  const seen = new Set<string>();
  return queries
    .filter((query) => query.location && !query.employer)
    .map((query) => ({ ...query, location: undefined }))
    .filter((query) => {
      if (seen.has(query.keywords)) return false;
      seen.add(query.keywords);
      return true;
    });
}
