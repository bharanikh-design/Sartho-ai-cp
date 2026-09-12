import type { JobSearchQuery } from "@/lib/jobs/search-provider";
import { earlyCareerSelections } from "@/lib/jobs/employment-types";
import { marketTitleIn } from "@/lib/matching/job-family";
import { generateStructuredJson } from "@/lib/ai/provider";

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
 * Strip search-engine syntax out of a keyword string.
 *
 * Neither provider speaks Boolean. Adzuna ANDs every term in `what` — its own
 * note above `what_or` says so — and JSearch takes one free-text phrase. So a
 * string like `(Engagement Manager OR Delivery Director) -(Junior OR Associate)`
 * is not a clever query there, it is a demand for adverts containing the literal
 * words "OR", "Junior" and "Associate", which is no advert at all. That is the
 * whole reason a brief could come back with nothing while both providers
 * answered normally.
 *
 * Negative terms are removed rather than kept, because there is no way to
 * express them: leaving `-(Junior)` in would ask for postings that DO say
 * "Junior", the exact opposite of the intent. Dropping a term a provider cannot
 * honour loses a refinement; keeping it loses every result.
 *
 * This is the safety net, not the fix. The prompt in planSmartSearchQueries
 * asks for plain titles precisely so this has nothing to do.
 */
export function sanitiseProviderKeywords(raw: string): string {
  if (!raw) return "";
  const withoutNegatives = raw
    /* `-(Junior OR Associate)` and `-Junior`, before anything unwraps them. */
    .replace(/[-\u2013\u2014]\s*\([^)]*\)/g, " ")
    .replace(/(^|\s)[-\u2013\u2014][A-Za-z][\w'']*/g, " ");

  return withoutNegatives
    /* Whatever is left of a group is just words; the brackets are not. */
    .replace(/[()[\]{}"']/g, " ")
    /* Operators as standalone words only, so "Android" and "Oracle" survive. */
    .replace(/\b(?:AND|OR|NOT|TO|NEAR)\b/g, " ")
    .replace(/[^A-Za-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

/*
 * The brief is applied as a hierarchy — country, then geography, then target
 * companies, then roles, then work model. This turns a saved brief into the
 * concrete list of provider queries, in priority order:
 *
 *   1. the top role in each of the first two cities (or nationwide when none);
 *   2. every remaining saved role in the first city;
 *   3. every saved role for every selected company, country-wide.
 *
 * Kept pure so the mapping from brief to queries is testable without a network.
 */
export const MAX_LOCATION_QUERIES = 2;

/*
 * How many model-suggested titles may ride along on top of the person's own.
 * Two is enough for the semantic expansion that is worth having ("Engagement
 * Manager" also posted as "Delivery Manager") without letting a generation
 * spend the whole time budget on guesses.
 */
export const MAX_SUGGESTED_QUERIES = 2;

/*
 * Every employer a person lists gets searched — the cap used to be four, so
 * nine selected employers meant five were silently never queried, and the brief
 * said "companies: PwC, KPMG, Deloitte, EY" as though that were the whole list.
 * A ceiling still exists so one person cannot spend the entire time budget on
 * employer queries alone, but it is far above any realistic shortlist.
 */
export const MAX_COMPANY_QUERIES = 12;

export function planSearchQueries(input: {
  roles: string[];
  country: string;
  locations: string[];
  companies: string[];
  remotePreferences: string[];
  employmentTypes?: string[];
  /**
   * This market's words for a graduate role, when the person is early enough in
   * their career for those postings to be worth a pass of their own.
   */
  entryLevelTerms?: string[];
  resumeSkills?: string[];
  smartKeywords?: string[];
}): JobSearchQuery[] {
  const remoteOnly = input.remotePreferences.length === 1 && input.remotePreferences[0] === "Remote";
  const employmentTypes = input.employmentTypes?.length ? input.employmentTypes : undefined;
  const locations = input.locations.map((item) => item.trim()).filter(Boolean).slice(0, MAX_LOCATION_QUERIES);
  const primaryLocation = locations[0];
  /*
   * The deterministic titles are the floor, and the model's suggestions are
   * added to them — never swapped in for them.
   *
   * Replacing was the old behaviour, and it meant one bad generation silently
   * threw away toSearchKeywords and the market-title mapping written to fix
   * exactly this, leaving a brief searched with fewer and worse queries than if
   * the model had never run. A suggestion can now only widen the search.
   */
  const baseRoles: Array<{ keywords: string; targetRole?: string; suggested?: boolean }> = input.roles.map((targetRole) => ({
    keywords: toSearchKeywords(targetRole),
    targetRole,
  })).filter((role) => role.keywords);
  const suggested = (input.smartKeywords ?? [])
    .map(sanitiseProviderKeywords)
    .filter((keywords) => keywords.split(" ").length > 1)
    .slice(0, MAX_SUGGESTED_QUERIES);
  const seenRole = new Set<string>();
  const roles = [
    ...baseRoles,
    ...suggested.map((keywords) => ({ keywords, targetRole: undefined, suggested: true })),
  ].filter((role) => {
    const key = role.keywords.toLowerCase();
    if (seenRole.has(key)) return false;
    seenRole.add(key);
    return true;
  });
  const queries: JobSearchQuery[] = [];
  const topRole = roles[0];
  if (!topRole) return queries;

  // The top role gets every city; a second city is where most "expand my
  // radius" asks actually land, and one extra query is affordable.
  if (locations.length) {
    for (const location of locations) {
      queries.push({ ...topRole, country: input.country, location, remoteOnly, employmentTypes, limit: 20 });
    }
  } else {
    queries.push({ ...topRole, country: input.country, remoteOnly, employmentTypes, limit: 20 });
  }
  // Guarantee one provider call for every saved target before spending budget
  // on employer combinations, extra cities, or generated title expansions.
  for (const role of baseRoles.slice(1)) {
    queries.push({ ...role, country: input.country, location: primaryLocation, remoteOnly, employmentTypes, limit: 20 });
  }
  // Once every saved role has a broad search, cover every saved role at every
  // selected employer. Generated alternatives come afterwards and can widen,
  // but never displace, the person's explicit choices.
  for (const employer of input.companies.slice(0, MAX_COMPANY_QUERIES)) {
    for (const role of baseRoles) {
      queries.push({ ...role, country: input.country, employer, remoteOnly, employmentTypes, limit: 10 });
    }
  }
  for (const role of roles.filter((role) => role.suggested)) {
    queries.push({ ...role, country: input.country, location: primaryLocation, remoteOnly, employmentTypes, limit: 20 });
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
    for (const role of baseRoles) {
      queries.push({
        ...role,
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
      const cohortKeywords = entryLevelTerms[0];
      if (!cohortKeywords) continue;
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

/*
 * The same plan, widened with alternative job titles for the same work.
 *
 * This used to ask for "Boolean/Semantic keyword strings" with negative terms,
 * and handed the result straight to providers that parse neither — see
 * sanitiseProviderKeywords for what that cost. It now asks for the only thing a
 * jobs API can actually use, a title an employer would post, and whatever comes
 * back is sanitised and added to the deterministic queries rather than put in
 * their place. A failed or empty generation is not a degraded search: it is the
 * same search that would have run without it.
 */
export async function planSmartSearchQueries(input: Parameters<typeof planSearchQueries>[0]): Promise<JobSearchQuery[]> {
  if (!input.resumeSkills || input.resumeSkills.length === 0 || !input.roles || input.roles.length === 0) {
    return planSearchQueries(input);
  }
  
  try {
    const response = await Promise.race([
      generateStructuredJson({
        workload: "fast",
        system: [
          "You expand a candidate's target roles into the other job titles employers post for the same work.",
          "Return job titles exactly as an employer would write them in a posting headline.",
          "RULES:",
          "1. Plain titles only. No Boolean operators (AND, OR, NOT), no parentheses, no quotes, no minus signs, no wildcards.",
          "2. One title per string, 2 to 5 words. Not a sentence, not a keyword list.",
          "3. Give alternative titles for the SAME level and line of work — a senior delivery role expands to 'Delivery Director' or 'Programme Director', never to a junior or a sales title.",
          "4. Do not repeat a title the candidate already gave you.",
          "Output JSON: an object with one array property \"keywords\" holding up to 3 strings.",
        ].join("\n"),
        prompt: `Roles: ${input.roles.join(", ")}\nSkills: ${input.resumeSkills.join(", ")}`,
        schemaName: "smart_search_queries",
        schema: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 3,
            }
          },
          required: ["keywords"],
          additionalProperties: false,
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
    ]) as { keywords?: string[] };

    const smartKeywords = (response.keywords || []).filter(Boolean);
    if (smartKeywords.length === 0) {
      return planSearchQueries(input);
    }
    
    return planSearchQueries({ ...input, smartKeywords });
  } catch (error) {
    console.error("Smart search query generation failed, falling back to basic search:", error);
    return planSearchQueries(input);
  }
}
