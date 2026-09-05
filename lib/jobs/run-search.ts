import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareerWorkspace } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { countryName, normaliseCountryCode } from "@/lib/jobs/countries";
import { splitMisfiledCompanies } from "@/lib/jobs/employers";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";
import { candidateSeniority, seniorityOf } from "@/lib/matching/title-fit";
import {
  MAX_COMPANY_QUERIES,
  MAX_LOCATION_QUERIES,
  MAX_ROLE_QUERIES,
  planSearchQueries,
  toSearchKeywords,
  widenToCountry,
} from "@/lib/jobs/search-plan";
import {
  isJobSearchConfigured,
  configuredJobSearchProviders,
  defaultJobMarket,
  providersForCountry,
  searchWithProvider,
  JobSearchNotConfiguredError,
  type JobSearchProviderName,
  type JobSearchQuery,
  type JobSearchResult,
} from "@/lib/jobs/search-provider";

/*
 * The one search engine, shared by "Search now" on Search Brief and by the
 * scheduled match-alert run. Both take a person's saved brief, query the jobs
 * providers as a hierarchy (country → city → companies → roles → work model),
 * and rank what comes back against that person's own approved evidence.
 * Nothing here saves anything: the caller decides what to do with the result.
 */

export type ScoredJobMatch = {
  title: string;
  employer: string | null;
  location: string | null;
  url: string;
  salary: string | null;
  postedAt: string | null;
  source: string;
  description: string;
  overallMatch: number;
  recommendation: "apply" | "review" | "skip";
  matchedSkills: string[];
  /* Why the number is what it is, so a score never arrives unexplained. */
  titleFit: number;
  requirementCoverage: number;
  closestTitle: string | null;
  missingRequirements: string[];
};

/* What was actually searched, so the page (or email) can say so. */
/** How far above the person a role may sit before it stops being for them. */
export const MAX_SENIORITY_STRETCH = 2;

export type SearchCriteria = {
  /** The primary market. */
  country: string;
  /** Every market searched. */
  countries: string[];
  /** Employment types applied as a provider filter. */
  employmentTypes: string[];
  /** The level the person is at, and how many roles were dropped as too senior. */
  candidateLevel: number;
  tooSenior: number;
  /** All markets, named. */
  countryName: string;
  countrySource: "brief" | "resume" | "default";
  /** The cities actually queried (up to two). */
  locations: string[];
  /** True when the cities were thin and the whole country was searched as well. */
  broadened: boolean;
  companies: string[];
  roles: string[];
  remoteOnly: boolean;
  providers: string[];
  queriesRun: number;
  queriesSkipped: number;
};

export type BriefSearchFailureCode = "not_configured" | "no_targets" | "country_unsupported" | "provider_error";

export type BriefSearchOutcome =
  | { ok: true; results: ScoredJobMatch[]; criteria: SearchCriteria }
  | { ok: false; code: BriefSearchFailureCode; error: string };

/** Fewer strong matches than this from the cities alone triggers a country-wide pass. */
export const MIN_STRONG_BEFORE_WIDENING = 3;

export const NOT_CONFIGURED_MESSAGE =
  "Jobs search isn't connected yet. Add a provider key (JSEARCH_RAPIDAPI_KEY for Google for Jobs, or ADZUNA_APP_ID / ADZUNA_APP_KEY) to turn on real search.";

export async function runBriefSearch(
  supabase: SupabaseClient,
  userId: string,
  options: { budgetMs?: number; maxResults?: number } = {},
): Promise<BriefSearchOutcome> {
  if (!isJobSearchConfigured()) {
    return { ok: false, code: "not_configured", error: NOT_CONFIGURED_MESSAGE };
  }

  const [{ profile, roles, evidence, lanes }, preferences] = await Promise.all([
    getCareerWorkspace(supabase, userId),
    getSearchPreferences(supabase, userId),
  ]);

  const activeLanes = lanes
    .filter((lane) => lane.active)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_ROLE_QUERIES);
  if (!activeLanes.length) {
    return {
      ok: false,
      code: "no_targets",
      error: "Choose your target roles in Career Direction first — that's what Sartho searches for.",
    };
  }

  /*
   * Country resolution, most deliberate signal first: the market the person
   * chose on Search Brief, then the one read from their résumé, then the
   * deployment default (only for briefs saved before country existed).
   */
  const chosen = preferences.countries.length
    ? preferences.countries
    : [preferences.country ?? profile?.country ?? ""];
  const markets = [...new Set(
    chosen.map((code) => normaliseCountryCode(code)).filter((code): code is string => Boolean(code)),
  )];
  if (!markets.length) markets.push(defaultJobMarket());

  const country = markets[0];
  const countryLabel = markets.map((code) => countryName(code) ?? code.toUpperCase()).join(", ");

  const providers = [...new Set(markets.flatMap((market) => providersForCountry(market)))];
  if (!providers.length) {
    const configured = configuredJobSearchProviders();
    return {
      ok: false,
      code: "country_unsupported",
      error: configured.length
        ? `${countryLabel} isn't covered by the configured jobs provider (Adzuna). Add a JSEARCH_RAPIDAPI_KEY for Google for Jobs, which covers every market.`
        : NOT_CONFIGURED_MESSAGE,
    };
  }

  // Employers typed into the cities list (before companies had a field) are
  // treated as companies here too, so an unsaved brief still searches sensibly.
  const brief = splitMisfiledCompanies(preferences.targetLocations, preferences.targetCompanies);
  const roleNames = activeLanes.map((lane) => lane.name);

  /*
   * The primary market gets the full plan. Each additional market gets the top
   * role only — someone with work rights in three countries should see all
   * three, without tripling the provider calls for every role and employer.
   */
  const queries = [
    ...planSearchQueries({
      roles: roleNames,
      country,
      locations: brief.locations,
      companies: brief.companies,
      remotePreference: preferences.remotePreference,
      employmentTypes: preferences.employmentTypes,
    }),
    ...markets.slice(1).flatMap((market) => planSearchQueries({
      roles: roleNames.slice(0, 1),
      country: market,
      locations: [],
      companies: [],
      remotePreference: preferences.remotePreference,
      employmentTypes: preferences.employmentTypes,
    })),
  ];

  /*
   * Queries run sequentially with a short gap so a low rate limit is not
   * tripped by a parallel burst, under a wall-clock budget that leaves room to
   * score and respond inside the caller's limit. A single query failing does
   * not sink the whole search — we keep whatever the others returned and only
   * surface an error when nothing came back at all. A provider that fails once
   * is skipped for the rest of this run.
   */
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 42_000;
  const dead = new Set<JobSearchProviderName>();
  const byUrl = new Map<string, JobSearchResult>();
  const errors: string[] = [];
  const providersUsed = new Set<string>();
  let queriesRun = 0;
  let queriesSkipped = 0;

  async function run(list: JobSearchQuery[]) {
    for (let index = 0; index < list.length; index++) {
      if (Date.now() - startedAt > budgetMs) { queriesSkipped += list.length - index; break; }
      if (queriesRun > 0) await new Promise((resolve) => setTimeout(resolve, 900));
      for (const provider of providers) {
        if (dead.has(provider)) continue;
        try {
          const batch = await searchWithProvider(provider, list[index]);
          queriesRun++;
          providersUsed.add(provider === "jsearch" ? "Google for Jobs" : "Adzuna");
          for (const result of batch) {
            if (!byUrl.has(result.url)) byUrl.set(result.url, result);
          }
          break; // this provider answered; move to the next query
        } catch (caught) {
          if (caught instanceof JobSearchNotConfiguredError) { dead.add(provider); continue; }
          errors.push(`${provider}: ${caught instanceof Error ? caught.message : "unknown error"}`);
          dead.add(provider); // fall through to the next provider for this and later queries
        }
      }
      if (dead.size === providers.length) { queriesSkipped += list.length - index - 1; break; }
    }
  }

  await run(queries);

  if (!byUrl.size && errors.length) {
    console.error("Jobs search failed", errors);
    return { ok: false, code: "provider_error", error: `Jobs provider error: ${errors[errors.length - 1]}` };
  }

  const score = (result: JobSearchResult): ScoredJobMatch => {
    const scored = scoreOpportunity(result.title, result.description, evidence, roles, lanes);
    return {
      title: result.title,
      employer: result.employer,
      location: result.location,
      url: result.url,
      salary: result.salary,
      postedAt: result.postedAt,
      source: result.source,
      description: result.description,
      overallMatch: scored.overallMatch,
      recommendation: scored.recommendation,
      matchedSkills: scored.analysis.matchedSkills?.map((skill) => skill.name).slice(0, 6) ?? [],
      titleFit: scored.breakdown.titleFit,
      requirementCoverage: scored.breakdown.requirementCoverage,
      closestTitle: scored.analysis.closestTitle ?? null,
      missingRequirements: scored.analysis.missingRequirements?.slice(0, 4) ?? [],
    };
  };

  /*
   * Location intelligence, step one: the cities are the first radius, not the
   * only one. If they yield fewer than a handful of strong matches, the same
   * roles are searched again with no city, so the rest of the country is
   * covered — and the criteria say so, rather than silently mixing the two.
   */
  const scoredByUrl = new Map<string, ScoredJobMatch>();
  const strongCount = () => Array.from(scoredByUrl.values()).filter((item) => item.recommendation !== "skip").length;
  for (const [url, result] of byUrl) scoredByUrl.set(url, score(result));

  const usedLocations = brief.locations.slice(0, MAX_LOCATION_QUERIES);
  let broadened = false;
  if (usedLocations.length && strongCount() < MIN_STRONG_BEFORE_WIDENING && dead.size < providers.length) {
    broadened = true;
    const before = new Set(byUrl.keys());
    await run(widenToCountry(queries));
    for (const [url, result] of byUrl) {
      if (!before.has(url)) scoredByUrl.set(url, score(result));
    }
  }

  /*
   * Seniority is a hard filter, not a soft penalty.
   *
   * Someone fresh out of university was being shown Consultant and Manager
   * roles. Scoring them low is not enough — a list of jobs a person cannot get
   * is noise however it is ordered, and it makes every other result harder to
   * see. A role more than two levels above them is dropped, and the count is
   * reported so the filtering is visible rather than silent.
   */
  const heldTitles = roles.map((role) => role.title).filter(Boolean);
  const level = candidateSeniority(heldTitles, profile?.total_experience_years ?? null);
  const withinReach: ScoredJobMatch[] = [];
  let tooSenior = 0;
  for (const match of scoredByUrl.values()) {
    if (seniorityOf(match.title) - level > MAX_SENIORITY_STRETCH) { tooSenior += 1; continue; }
    withinReach.push(match);
  }

  const results: ScoredJobMatch[] = withinReach
    .sort((a, b) => b.overallMatch - a.overallMatch)
    .slice(0, options.maxResults ?? 20);

  const criteria: SearchCriteria = {
    country,
    countries: markets,
    employmentTypes: preferences.employmentTypes,
    candidateLevel: level,
    tooSenior,
    countryName: countryLabel,
    countrySource: preferences.country ? "brief" : profile?.country ? "resume" : "default",
    locations: usedLocations,
    broadened,
    companies: brief.companies.slice(0, MAX_COMPANY_QUERIES),
    roles: activeLanes.map((lane) => toSearchKeywords(lane.name)),
    remoteOnly: preferences.remotePreference === "Remote",
    providers: Array.from(providersUsed),
    queriesRun,
    queriesSkipped,
  };

  /*
   * Kept, so returning to Search Brief is a read. Results used to live in one
   * browser tab for thirty minutes; closing it meant spending provider calls
   * again to see the same roles.
   */
  const { error: storeError } = await supabase.from("search_results").upsert({
    user_id: userId,
    results,
    criteria,
    searched_at: new Date().toISOString(),
  });
  if (storeError) console.error("Could not store search results", { code: storeError.code });

  return { ok: true, results, criteria };
}

/** The last stored search, or null when this person has never run one. */
export async function getStoredSearch(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ results: ScoredJobMatch[]; criteria: SearchCriteria; searchedAt: string } | null> {
  const { data } = await supabase
    .from("search_results")
    .select("results,criteria,searched_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || !Array.isArray(data.results) || !data.results.length) return null;
  return {
    results: data.results as ScoredJobMatch[],
    criteria: data.criteria as SearchCriteria,
    searchedAt: typeof data.searched_at === "string" ? data.searched_at : new Date().toISOString(),
  };
}
