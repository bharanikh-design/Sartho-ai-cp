import type { JobSearchQuery } from "@/lib/jobs/search-provider";
import { earlyCareerSelections } from "@/lib/jobs/employment-types";
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

/*
 * Every employer a person lists gets searched — the cap used to be four, so
 * nine selected employers meant five were silently never queried, and the brief
 * said "companies: PwC, KPMG, Deloitte, EY" as though that were the whole list.
 * A ceiling still exists so one person cannot spend the entire time budget on
 * employer queries alone, but it is far above any realistic shortlist.
 */
export const MAX_COMPANY_QUERIES = 12;

/*
 * Employers are searched against the top two roles rather than only the first.
 * "Deloitte" alone is not what somebody means when they list an employer beside
 * three target roles; the second role roughly doubles useful employer coverage
 * for one extra query each, which the budget absorbs.
 */
export const COMPANY_ROLE_DEPTH = 2;

export function planSearchQueries(input: {
  roles: string[];
  country: string;
  locations: string[];
  companies: string[];
  remotePreference: string | null;
  employmentTypes?: string[];
  /**
   * This market's words for a graduate role, when the person is early enough in
   * their career for those postings to be worth a pass of their own.
   */
  entryLevelTerms?: string[];
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
    for (const keywords of roles.slice(0, COMPANY_ROLE_DEPTH)) {
      queries.push({ keywords, country: input.country, employer, remoteOnly, employmentTypes, limit: 10 });
    }
  }

  /*
   * Internship and graduate programme get their own pass. Neither has an Adzuna
   * filter, and the full-time and permanent flags selected alongside them would
   * exclude exactly what they are looking for, so this pass drops those flags
   * and carries the words in the query text instead.
   *
   * Somebody in their first year gets the same pass whether or not they thought
   * to tick "Internship" under type of work. Those two questions are not the
   * same — one is a contract, the other is where you are in your career — and
   * requiring the first to get graduate postings is a trap for exactly the
   * person who most needs them.
   */
  const earlyCareer = earlyCareerSelections(input.employmentTypes ?? []);
  const entryLevelTerms = input.entryLevelTerms?.filter((term) => term.trim()) ?? [];
  if (earlyCareer.length || entryLevelTerms.length) {
    for (const keywords of roles.slice(0, COMPANY_ROLE_DEPTH)) {
      queries.push({
        keywords,
        country: input.country,
        location: primaryLocation,
        remoteOnly,
        employmentTypes,
        earlyCareerOnly: true,
        entryLevelTerms: entryLevelTerms.length ? entryLevelTerms : undefined,
        limit: 20,
      });
    }
    for (const employer of input.companies.slice(0, MAX_COMPANY_QUERIES)) {
      const cohortKeywords = entryLevelTerms[0] ?? "graduate";
      queries.push({
        keywords: cohortKeywords,
        country: input.country,
        employer,
        remoteOnly,
        employmentTypes,
        earlyCareerOnly: true,
        entryLevelTerms: entryLevelTerms.length ? entryLevelTerms : undefined,
        limit: 10,
      });
    }
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
