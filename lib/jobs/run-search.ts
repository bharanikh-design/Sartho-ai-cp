import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareerWorkspace } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { countryName, normaliseCountryCode } from "@/lib/jobs/countries";
import { splitMisfiledCompanies } from "@/lib/jobs/employers";
import { filterableSelections } from "@/lib/jobs/employment-types";
import {
  bandForYears,
  entryLevelTermsFor,
  experienceBand,
  normaliseExperienceBand,
  yearsForExperienceFilter,
  yearsForSeniority,
  type ExperienceBandId,
} from "@/lib/jobs/experience";
import { familyFit, reachFrom } from "@/lib/matching/job-family";
import { demandsMoreExperience, requiredExperienceIn } from "@/lib/matching/required-experience";
import { fetchAdvertText } from "@/lib/jobs/advert-text";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";
import { candidateSeniority, isEntryLevelTitle } from "@/lib/matching/title-fit";
import { seniorityReach } from "@/lib/matching/seniority-reach";
import { searchEmployerDirectly } from "@/lib/jobs/company-careers/registry";
import { deduplicateSearchResults, isMarketLocationConsistent } from "@/lib/jobs/location-guard";
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
  /** Whether closestTitle is a job held, or only one being aimed at. */
  closestIsHeld: boolean;
  /** How many capabilities were legible in the advert, so a % has a denominator. */
  requirementsRead: number;
  missingRequirements: string[];
  /**
   * The fewest years the advert asks for, when it says so, and the phrase it
   * was read from. Shown on the card: a person deciding whether to spend an
   * hour on an application deserves to see the requirement that decides it.
   */
  requiredYears: number | null;
  requiredEvidence: string | null;
  /**
   * The boards carrying this advert, and whether the employer's own site is
   * one of them. Applying direct usually beats applying through an aggregator,
   * so it is worth saying which link that is.
   */
  platforms: string[];
  applyDirect: boolean;
};

/* What was actually searched, so the page (or email) can say so. */
/*
 * How far above the person a role may sit before it stops being for them.
 *
 * One level, not two. At two, someone six months out of university — level 1
 * once an inflated title is tempered by years — was still shown level 3
 * "Senior" postings. One level lets them see the unqualified grade they should
 * actually be applying for (Analyst, Consultant) and stops there. Nobody
 * becomes a Senior Consultant or an Engagement Manager in six months.
 */
export const MAX_SENIORITY_STRETCH = 1;

export type SearchCriteria = {
  /** The primary market. */
  country: string;
  /** Every market searched. */
  countries: string[];
  /** Employment types applied as a real provider filter. */
  employmentTypes: string[];
  /** Selections carried only as words in the query, because no filter exists. */
  employmentHinted: string[];
  /** Employers actually queried, and how many were asked for. */
  companiesRequested: number;
  /** The level the person is at, and how many roles were dropped as too senior. */
  candidateLevel: number;
  tooSenior: number;
  /** The experience band searched against, and where that answer came from. */
  experienceLevel: ExperienceBandId | null;
  experienceSource: "brief" | "resume" | "unknown";
  /**
   * Roles dropped for demanding more years than the person has.
   *
   * Counted separately from tooSenior because they are different findings: one
   * is read off a title, the other off a stated requirement in the advert. A
   * role titled "Analyst" that opens with "8+ years' experience" is caught only
   * by this one.
   */
  tooMuchExperience: number;
  /** True when graduate and entry-level postings got their own search pass. */
  earlyCareerPass: boolean;
  /**
   * How many full adverts were opened and read.
   *
   * The provider returns a truncated snippet, and the stated requirement is
   * almost never in it. This number is the honest measure of how much the
   * years filter could actually see.
   */
  advertsRead: number;
  /** Roles dropped as a different line of work, and the families kept. */
  offFamily: number;
  families: string[];
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
  providerErrors?: string[];
  queriesRun: number;
  queriesSkipped: number;
};

export type BriefSearchFailureCode = "not_configured" | "no_targets" | "country_unsupported" | "provider_error";

export type BriefSearchOutcome =
  | { ok: true; results: ScoredJobMatch[]; criteria: SearchCriteria }
  | { ok: false; code: BriefSearchFailureCode; error: string };

/** Fewer strong matches than this from the cities alone triggers a country-wide pass. */
export const MIN_STRONG_BEFORE_WIDENING = 3;

/*
 * How many full adverts one search may open.
 *
 * Only ever the roles that already survived the free filters, and never more
 * than are about to be shown — reading the twenty-first advert to decide
 * whether to hide it from a list of twenty is work for nobody.
 */
const MAX_ADVERTS_READ = 24;
const ADVERT_CONCURRENCY = 6;
const ADVERT_BUDGET_MS = 12_000;

function readRequirement(text: string): { requiredYears: number | null; requiredEvidence: string | null } {
  const required = requiredExperienceIn(text);
  return {
    requiredYears: required.minYears,
    requiredEvidence: required.evidence,
  };
}

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
   * Experience, most deliberate signal first: the band the person chose, then
   * the band their résumé's total falls into, then nothing.
   *
   * "Nothing" is deliberately not zero. Treating an unanswered question as no
   * experience would filter a director's search down to graduate roles, so when
   * neither source says anything the years filter is simply not applied and the
   * criteria say the question is unanswered.
   */
  const chosenBand = experienceBand(preferences.experienceLevel);
  const resumeBand = experienceBand(bandForYears(profile?.total_experience_years ?? null));
  const band = chosenBand ?? resumeBand;
  const experienceSource: SearchCriteria["experienceSource"] =
    chosenBand ? "brief" : resumeBand ? "resume" : "unknown";

  /*
   * Two numbers from one band, and they are not interchangeable. Seniority
   * takes the bottom, so an inflated title is tempered by the least the person
   * claimed; the years filter takes the top, because it removes roles from the
   * page and should remove fewer when the band is ambiguous.
   */
  const seniorityYears = band ? yearsForSeniority(band) : profile?.total_experience_years ?? null;
  const filterYears = band ? yearsForExperienceFilter(band) : null;

  /*
   * A graduate gets a pass of their own, in the words their market uses. This
   * is where the supply of genuinely reachable roles comes from — the filters
   * below only take things away.
   */
  const earlyCareerPass = band?.earlyCareer === true;

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
      entryLevelTerms: earlyCareerPass ? entryLevelTermsFor(country) : undefined,
    }),
    ...markets.slice(1).flatMap((market) => planSearchQueries({
      roles: roleNames.slice(0, 1),
      country: market,
      locations: [],
      companies: [],
      remotePreference: preferences.remotePreference,
      employmentTypes: preferences.employmentTypes,
      /* Each market gets its own vocabulary; "graduate scheme" finds nothing in Sydney. */
      entryLevelTerms: earlyCareerPass ? entryLevelTermsFor(market) : undefined,
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
  const budgetMs = options.budgetMs ?? 9_000;
  const dead = new Set<JobSearchProviderName>();
  const byUrl = new Map<string, JobSearchResult>();
  const errors: string[] = [];
  const providersUsed = new Set<string>();
  let queriesRun = 0;
  let queriesSkipped = 0;

  async function run(list: JobSearchQuery[]) {
    for (let index = 0; index < list.length; index++) {
      if (Date.now() - startedAt > budgetMs) { queriesSkipped += list.length - index; break; }
      if (queriesRun > 0) await new Promise((resolve) => setTimeout(resolve, 150));
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
          const label = provider === "jsearch" ? "Google for Jobs" : "Adzuna";
          errors.push(`${label}: ${caught instanceof Error ? caught.message : "unknown error"}`);
          dead.add(provider); // fall through to the next provider for this and later queries
        }
      }
      if (dead.size === providers.length) { queriesSkipped += list.length - index - 1; break; }
    }
  }

  await run(queries);

  /*
   * Direct company career portal search: for target employers that have known
   * ATS endpoints (Workday CXS, Greenhouse), query them directly to fetch
   * authentic first-party listings with direct apply links and 0 CAPTCHAs.
   */
  if (brief.companies.length) {
    const directTerm = earlyCareerPass
      ? (entryLevelTermsFor(country)[0] ?? "graduate")
      : (activeLanes[0]?.name ? toSearchKeywords(activeLanes[0].name) : "analyst");

    const directQueries = brief.companies.slice(0, 6).map(async (employer) => {
      try {
        const directMatches = await searchEmployerDirectly(employer, {
          employer,
          searchText: directTerm,
          country,
          limit: 10,
        });
        for (const item of directMatches) {
          if (!byUrl.has(item.url)) byUrl.set(item.url, item);
        }
        if (directMatches.length) providersUsed.add("Company Careers");
      } catch {
        // Direct ATS query failure is non-fatal; aggregator covers it.
      }
    });

    await Promise.allSettled(directQueries);
  }

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
      closestIsHeld: scored.analysis.closestIsHeld ?? false,
      requirementsRead: scored.analysis.requirementsRead ?? 0,
      missingRequirements: scored.analysis.missingRequirements?.slice(0, 4) ?? [],
      /*
       * Read from the snippet for now. The full advert is opened below for the
       * roles that survive the free filters, which is where this usually gets
       * its answer — the snippet is the marketing paragraph, and no advert
       * states its experience requirement there.
       */
      ...readRequirement(`${result.title}. ${result.description}`),
      platforms: result.platforms,
      applyDirect: result.applyDirect,
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
  if (usedLocations.length && strongCount() < MIN_STRONG_BEFORE_WIDENING && dead.size < providers.length && (Date.now() - startedAt < budgetMs - 2_500)) {
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
  const level = candidateSeniority(heldTitles, seniorityYears);
  const withinReach: ScoredJobMatch[] = [];
  let tooSenior = 0;
  let offFamily = 0;
  let tooMuchExperience = 0;

  /*
   * Job family is the second hard filter, and the one a recruiter applies first.
   *
   * Seniority alone let a Business Analyst be shown "Solutions Consultant"
   * roles: the level was right, so nothing stopped it, and 65% of the score
   * comes from requirement coverage and evidence depth — which a pre-sales
   * advert and a BA CV share plenty of. Scoring it low was never enough. A job
   * in a different function is not a weak match, it is the wrong job, and it
   * pushes the right ones off the page.
   */
  /*
   * Stated years are the third filter, and the only one that reads the advert
   * rather than its title.
   *
   * "Analyst", "Consultant" and "Engineer" carry no seniority word, so the
   * title filter passes them, and plenty of them open with "6+ years required".
   * For somebody fresh out of university those are most of the page, and after
   * the third screen of them the conclusion is that the tool does not work.
   *
   * It only ever fires on a requirement the advert actually wrote down, which
   * means its reach depends on how much of the advert the provider returned —
   * Adzuna sends a truncated snippet, so a requirement buried on page two of
   * the posting is not visible here and the role stays. Under-removing is the
   * right direction to fail in, and the count says how many it caught rather
   * than implying it caught them all.
   */
  /*
   * The free filters first, so nothing is fetched for a role already out on
   * seniority or line of work.
   */
  const survivors: ScoredJobMatch[] = [];
  for (const match of scoredByUrl.values()) {
    if (!seniorityReach(match.title, heldTitles, seniorityYears).withinReach) { tooSenior += 1; continue; }
    if (!familyFit(match.title, heldTitles, roleNames).withinReach) { offFamily += 1; continue; }
    if (!isMarketLocationConsistent(match, country)) continue;
    survivors.push(match);
  }
  survivors.sort((a, b) => b.overallMatch - a.overallMatch);

  /*
   * Then open the adverts, because the snippet does not contain the answer.
   *
   * This is the fix for the failure that made the whole feature a joke: a
   * graduate set their experience to 0–1 and was shown a finance role asking
   * for three, because the only text Sartho ever received was the opening
   * paragraph. Every advert puts "SKILLS & EXPERIENCE: at least 3 years"
   * further down, so the filter was reading the one part of the page
   * guaranteed not to hold the requirement.
   *
   * Best effort throughout. A page that will not load leaves the role exactly
   * as the snippet described it, and the criteria report how many were
   * actually read rather than implying every one was.
   */
  let advertsRead = 0;
  if (filterYears !== null && Number.isFinite(filterYears)) {
    const candidates = survivors.slice(0, MAX_ADVERTS_READ).filter((match) => match.url);
    const remainingMs = Math.max(0, (startedAt + budgetMs) - Date.now());
    const deadline = Date.now() + Math.min(ADVERT_BUDGET_MS, remainingMs);

    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length && Date.now() < deadline) {
        const match = candidates[cursor];
        cursor += 1;
        const text = await fetchAdvertText(match.url);
        if (!text) continue;
        advertsRead += 1;
        const read = readRequirement(`${match.title}. ${text}`);
        /*
         * The fuller reading replaces the snippet's only when it found
         * something. A page that mentions no requirement does not erase one
         * the snippet happened to state.
         */
        if (read.requiredYears !== null) {
          match.requiredYears = read.requiredYears;
          match.requiredEvidence = read.requiredEvidence;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(ADVERT_CONCURRENCY, candidates.length) }, worker));
  }

  for (const match of survivors) {
    if (filterYears !== null && match.requiredYears !== null) {
      const required = { minYears: match.requiredYears, evidence: match.requiredEvidence, entryFriendly: false };
      if (demandsMoreExperience(required, filterYears)) { tooMuchExperience += 1; continue; }
    } else if (earlyCareerPass && match.requiredYears === null) {
      // For early career (0-1 years), an advert whose requirements could not be
      // read from scraping or snippets must show affirmative entry-level evidence.
      // Unqualified mid-level roles (e.g. "Associate Consultant", "Financial Analyst")
      // that asked for 3-7 years on anti-bot protected pages are thus prevented
      // from flooding the feed.
      const entryInTitle = isEntryLevelTitle(match.title);
      const entryInBody = requiredExperienceIn(`${match.title}. ${match.description}`).entryFriendly;
      if (!entryInTitle && !entryInBody && !match.applyDirect) {
        tooMuchExperience += 1;
        continue;
      }
    }
    withinReach.push(match);
  }

  const deduplicated = deduplicateSearchResults(withinReach);
  const results: ScoredJobMatch[] = deduplicated.slice(0, options.maxResults ?? 20);

  const criteria: SearchCriteria = {
    country,
    countries: markets,
    /*
     * Split, because they are not the same promise. A filter narrows at the
     * provider; a hint is a word in the query and may be ignored. Reporting
     * both as "employment types" is how two of four selections looked applied
     * while doing nothing at all.
     */
    employmentTypes: preferences.employmentTypes.filter(
      (type) => providers.some((provider) => filterableSelections([type], provider).length),
    ),
    employmentHinted: preferences.employmentTypes.filter(
      (type) => !providers.some((provider) => filterableSelections([type], provider).length),
    ),
    companiesRequested: brief.companies.length,
    candidateLevel: level,
    tooSenior,
    experienceLevel: band?.id ?? null,
    experienceSource,
    tooMuchExperience,
    earlyCareerPass,
    advertsRead,
    offFamily,
    families: reachFrom(heldTitles, roleNames),
    countryName: countryLabel,
    countrySource: preferences.country ? "brief" : profile?.country ? "resume" : "default",
    locations: usedLocations,
    broadened,
    companies: brief.companies.slice(0, MAX_COMPANY_QUERIES),
    roles: activeLanes.map((lane) => toSearchKeywords(lane.name)),
    remoteOnly: preferences.remotePreference === "Remote",
    providers: Array.from(providersUsed),
    providerErrors: errors.length ? errors : undefined,
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
  const results = normaliseResults(data.results);
  if (!results.length) return null;
  return {
    results,
    criteria: normaliseCriteria(data.criteria),
    searchedAt: typeof data.searched_at === "string" ? data.searched_at : new Date().toISOString(),
  };
}

/*
 * The other half of the same row.
 *
 * `criteria` was normalised after a bare cast over it crashed Find Roles, and
 * `results` — the same JSON column family, written by the same deploys, read on
 * the same line — was left as `data.results as ScoredJobMatch[]`. It carries the
 * identical risk and two live examples of it: `closestIsHeld` and
 * `requirementsRead` were both added to this type recently, so every match
 * stored before that deploy is missing them, and a card reading
 * `requirementsRead` on one of those rows gets undefined.
 *
 * A stored match that has lost its title or its url is not a card that can be
 * rendered or clicked, so it is dropped rather than defaulted into a row that
 * links nowhere. Everything else defaults: a missing number reads as 0 and a
 * missing list as empty, which shows a weak match rather than crashing.
 */
export function normaliseResults(stored: unknown): ScoredJobMatch[] {
  if (!Array.isArray(stored)) return [];

  const text = (input: unknown): string => (typeof input === "string" ? input : "");
  const nullableText = (input: unknown): string | null => (typeof input === "string" && input ? input : null);
  const count = (input: unknown): number => (typeof input === "number" && Number.isFinite(input) ? input : 0);
  const strings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];

  return stored.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Partial<ScoredJobMatch>;
    const title = text(value.title);
    const url = text(value.url);
    if (!title || !url) return [];

    return [{
      title,
      url,
      employer: nullableText(value.employer),
      location: nullableText(value.location),
      salary: nullableText(value.salary),
      postedAt: nullableText(value.postedAt),
      source: text(value.source),
      description: text(value.description),
      overallMatch: count(value.overallMatch),
      recommendation:
        value.recommendation === "apply" || value.recommendation === "skip" ? value.recommendation : "review",
      matchedSkills: strings(value.matchedSkills),
      titleFit: count(value.titleFit),
      requirementCoverage: count(value.requirementCoverage),
      closestTitle: nullableText(value.closestTitle),
      closestIsHeld: value.closestIsHeld === true,
      requirementsRead: count(value.requirementsRead),
      missingRequirements: strings(value.missingRequirements),
      requiredYears: typeof value.requiredYears === "number" && Number.isFinite(value.requiredYears) ? value.requiredYears : null,
      requiredEvidence: nullableText(value.requiredEvidence),
      platforms: strings(value.platforms),
      applyDirect: value.applyDirect === true,
    }];
  });
}

/**
 * A stored criteria row, brought up to the current shape.
 *
 * This used to be `data.criteria as SearchCriteria` — a bare cast over JSON
 * written by whatever version of this file was deployed at the time. The cast
 * makes TypeScript agree and changes nothing at runtime, so the day
 * `employmentHinted` was added, every search stored before it lacked the key,
 * the panel read `criteria.employmentHinted.length`, and Find Roles died on a
 * TypeError behind "That page did not load cleanly".
 *
 * Every field gets a default here, so adding another one later cannot break a
 * row that was written before it existed.
 */
export function normaliseCriteria(stored: unknown): SearchCriteria {
  const value = (stored ?? {}) as Partial<SearchCriteria>;
  const strings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
  const count = (input: unknown): number => (typeof input === "number" && Number.isFinite(input) ? input : 0);

  return {
    country: typeof value.country === "string" ? value.country : "",
    countries: strings(value.countries),
    employmentTypes: strings(value.employmentTypes),
    employmentHinted: strings(value.employmentHinted),
    companiesRequested: count(value.companiesRequested),
    candidateLevel: count(value.candidateLevel),
    tooSenior: count(value.tooSenior),
    experienceLevel: normaliseExperienceBand(value.experienceLevel),
    experienceSource:
      value.experienceSource === "brief" || value.experienceSource === "resume" ? value.experienceSource : "unknown",
    tooMuchExperience: count(value.tooMuchExperience),
    earlyCareerPass: value.earlyCareerPass === true,
    advertsRead: count(value.advertsRead),
    offFamily: count(value.offFamily),
    families: strings(value.families),
    countryName: typeof value.countryName === "string" ? value.countryName : "",
    countrySource: value.countrySource === "brief" || value.countrySource === "resume" ? value.countrySource : "default",
    locations: strings(value.locations),
    broadened: value.broadened === true,
    companies: strings(value.companies),
    roles: strings(value.roles),
    remoteOnly: value.remoteOnly === true,
    providers: strings(value.providers),
    queriesRun: count(value.queriesRun),
    queriesSkipped: count(value.queriesSkipped),
  };
}
