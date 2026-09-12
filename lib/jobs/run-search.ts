import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareerWorkspace } from "@/lib/data/career";
import { generateStructuredJson } from "@/lib/ai/provider";
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
import { familyFit, reachFrom, unclassifiedTitles } from "@/lib/matching/job-family";
import { demandsMoreExperience, requiredExperienceIn } from "@/lib/matching/required-experience";
import { fetchAdvertText } from "@/lib/jobs/advert-text";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";
import { candidateSeniority, isEntryLevelTitle } from "@/lib/matching/title-fit";
import { seniorityReach } from "@/lib/matching/seniority-reach";
import { findEmployerPortal, searchEmployerDirectly } from "@/lib/jobs/company-careers/registry";
import { deduplicateSearchResults, isMarketLocationConsistent } from "@/lib/jobs/location-guard";
import { createProviderCascade } from "@/lib/jobs/provider-cascade";
import {
  MAX_COMPANY_QUERIES,
  MAX_LOCATION_QUERIES,
  planSmartSearchQueries,
  toSearchKeywords,
  widenToCountry,
} from "@/lib/jobs/search-plan";
import {
  isJobSearchConfigured,
  configuredJobSearchProviders,
  defaultJobMarket,
  providerCallBudgetMs,
  providersForCountry,
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
  /** Optional model commentary; it never changes the evidence-grounded score. */
  screeningInsight?: string | null;
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
  /**
   * Target roles the family table could not place.
   *
   * Reported because an unrecognised target role used to narrow somebody's
   * search in silence: it contributed nothing to their reach, and the roles it
   * would have unlocked were hidden as a different line of work. The filter
   * now stands down when this is non-empty, and saying which titles fell
   * through is what lets a person fix it.
   */
  unrecognisedTargets?: string[];
  /** Dropped as belonging to another country's market. */
  offMarket?: number;
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
  /**
   * Providers that ran out of time, and how often. Said out loud because a
   * provider quietly dropping out is indistinguishable, from the page, from a
   * market with nothing in it.
   */
  /*
   * How often a provider ran out of time, and how long it was given.
   *
   * The wait is carried because a count alone cannot be read: "timed out 2
   * times" against six seconds is a budget that was too tight, and against
   * twenty seconds it is a provider that is genuinely not answering. Opposite
   * diagnoses from the same sentence.
   */
  providerTimeouts?: Array<{ name: string; count: number; waitedMs: number }>;
  /**
   * Each named employer's own careers portal, and what came of it. Free,
   * unmetered and aimed exactly where the person pointed it — and until now the
   * least visible part of a search.
   */
  employerPortals?: Array<{ employer: string; status: "searched" | "empty" | "failed" | "unknown"; found: number }>;
  queriesRun: number;
  queriesSkipped: number;
  targetRolesRequested?: number;
  targetRolesSearched?: number;
  employersChecked?: number;
};

export type BriefSearchFailureCode = "not_configured" | "no_targets" | "country_unsupported" | "provider_error";

export type BriefSearchOutcome =
  | { ok: true; results: ScoredJobMatch[]; criteria: SearchCriteria }
  | { ok: false; code: BriefSearchFailureCode; error: string };

export function withScreeningInsight(match: ScoredJobMatch, insight: string): ScoredJobMatch {
  return { ...match, screeningInsight: insight };
}

/** Fewer strong matches than this from the cities alone triggers a country-wide pass. */
export const MIN_STRONG_BEFORE_WIDENING = 3;

/*
 * How many full adverts one search may open.
 *
 * Only ever the roles that already survived the free filters, and never more
 * than are about to be shown — reading the twenty-first advert to decide
 * whether to hide it from a list of twenty is work for nobody.
 */
/*
 * The wall-clock budget for the query loop, and everything the loop pays for.
 *
 * It was twenty-eight seconds against a route that allows sixty, with a plan
 * reaching thirteen queries once a brief names employers — so two thirds of a
 * search regularly never ran and the page said "9 queries skipped (time
 * limit)" beside results from one provider. Forty-five fixed that against a
 * provider answering in three and a half seconds.
 *
 * SerpApi answers in nearly nine, which is the price of the full advert rather
 * than a marketing blurb, and it buys back far more than it costs downstream.
 * But at that rate forty-five seconds is five queries, and five queries is the
 * thin result set this was all meant to fix.
 *
 * Seventy-five is sized against the route's own ceiling of 120 seconds, not
 * picked for roundness: the advert reads take at most twelve, the screening
 * pass at most eight, and the writes after them are small — leaving around
 * thirty seconds of margin under the limit.
 */
export const DEFAULT_SEARCH_BUDGET_MS = 75_000;

/*
 * The longest any single call is given, however much budget is left.
 *
 * There is no matching floor constant. The floor is whatever the provider at
 * the front of the live cascade needs, read from providerCallBudgetMs — a
 * fixed one goes stale the moment the order changes, which is exactly what
 * happened when SerpApi took the lead: 6,000ms sat comfortably above JSearch's
 * 3.4 seconds and below SerpApi's 8.7.
 */
const MAX_CALL_MS = 20_000;

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

  /*
   * Two different questions, which were being answered with one list.
   *
   * How many roles to SEARCH for is a budget: each one costs a provider call,
   * so it is capped. What line of work a person is IN is not a budget at all —
   * it is who they are, and every target role they set is part of the answer.
   *
   * Sharing the capped list between the two silently discarded the tail of the
   * brief before the family filter ever saw it. Somebody with five target roles
   * whose fourth and fifth were "EUC and ITSM Transformation Lead" and "IT
   * Infrastructure & Cloud Migration Program Manager" had those dropped, so the
   * filter concluded they worked in Consulting and nothing else — and then hid
   * every IT operations role it found as "a different line of work". The brief
   * said IT infrastructure twice and the search refused to show any.
   */
  const targetedLanes = lanes
    .filter((lane) => lane.active)
    .sort((a, b) => a.priority - b.priority);
  const activeLanes = targetedLanes;
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
  /* Every target role, because this decides reach rather than spend. */
  const roleNames = targetedLanes.map((lane) => lane.name);
  // Extract the most common domains/skills from the user's evidence to contextualize the search.
  const domainCounts = new Map<string, number>();
  for (const record of (evidence || [])) {
    for (const domain of record.domains || []) {
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    }
  }
  const resumeSkills = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0])
    .slice(0, 3);

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
   * All markets receive the full set of roles.
   * With parallel execution, we can query multiple markets for multiple roles
   * without severely impacting the execution budget.
   */
  const queries = [
    ...(await planSmartSearchQueries({
      roles: roleNames,
      country,
      locations: brief.locations,
      companies: brief.companies,
      remotePreferences: preferences.remotePreferences,
      employmentTypes: preferences.employmentTypes,
      entryLevelTerms: earlyCareerPass ? entryLevelTermsFor(country) : undefined,
      resumeSkills,
    }))
  ];

  if (markets.length > 1) {
    const additionalQueries = await Promise.all(markets.slice(1).map(market => planSmartSearchQueries({
      roles: roleNames,
      country: market,
      locations: [],
      companies: [],
      remotePreferences: preferences.remotePreferences,
      employmentTypes: preferences.employmentTypes,
      /* Each market gets its own vocabulary; "graduate scheme" finds nothing in Sydney. */
      entryLevelTerms: earlyCareerPass ? entryLevelTermsFor(market) : undefined,
      resumeSkills,
    })));
    queries.push(...additionalQueries.flat());
  }

  /*
   * Queries run sequentially with a short gap so a low rate limit is not
   * tripped by a parallel burst, under a wall-clock budget that leaves room to
   * score and respond inside the caller's limit. A single query failing does
   * not sink the whole search — we keep whatever the others returned and only
   * surface an error when nothing came back at all.
   */
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? DEFAULT_SEARCH_BUDGET_MS;
  const remainingMs = () => Math.max(0, (startedAt + budgetMs) - Date.now());

  const byUrl = new Map<string, JobSearchResult>();
  let queriesRun = 0;
  let queriesSkipped = 0;
  const searchedTargetRoles = new Set<string>();
  const searchedEmployers = new Set<string>();
  let lastQueryEndedAt = 0;

  /*
   * What each named employer's own careers portal actually did. "unknown" means
   * the registry has no configuration for that company at all — the commonest
   * outcome, and previously indistinguishable from a portal that was searched
   * and had nothing.
   */
  const employerPortals: Array<{ employer: string; status: "searched" | "empty" | "failed" | "unknown"; found: number }> = [];

  /*
   * Providers are tried in order, not all at once.
   *
   * Every query used to fan out to both providers in parallel and merge the
   * two answers. That is not the fall-back configuredJobSearchProviders
   * describes, and it cost twice: every search spent two API calls per query
   * where one would do — halving a metered JSearch allowance — and it mixed
   * Adzuna's truncated blurbs into a pool scored on requirement coverage,
   * where a short description reads as a weak match rather than as a short
   * description. JSearch leads because it returns the whole advert and reaches
   * LinkedIn, Indeed and company career pages; Adzuna is what answers when
   * JSearch cannot, which is the only time its shallower records are better
   * than nothing.
   */
  const cascade = createProviderCascade(providers);

  /*
   * What one provider call may spend, given what is left.
   *
   * A fixed timeout is the wrong shape under a whole-search budget, but so is
   * one whose floor sits below what the provider actually takes. A floor of
   * three seconds once aborted perfectly good JSearch calls late in a run,
   * counted each abort as a failure, retired the deep provider after two, and
   * finished the search on the shallow one — and raising it to six seconds
   * only moved the same trap to the next provider, because SerpApi needs
   * nearly nine.
   *
   * So the floor follows the front of the cascade and cannot drift out of step
   * with the order again. It also falls as providers retire: once the slow
   * deep provider is dead, the rest of the run is spent on one that answers in
   * under half a second, and reserving twelve seconds a query for it would
   * throw away most of what is left.
   */
  const leadCallBudgetMs = () => {
    const lead = providers.find((provider) => !cascade.isDead(provider));
    return lead ? providerCallBudgetMs(lead) : MAX_CALL_MS;
  };
  const callTimeoutMs = () => Math.max(leadCallBudgetMs(), Math.min(MAX_CALL_MS, Math.round(remainingMs() / 2)));

  async function run(list: JobSearchQuery[]) {
    const concurrency = providers[0] === "serpapi" ? 3 : 1;
    for (let index = 0; index < list.length; index += concurrency) {
      if (Date.now() - startedAt > budgetMs) { queriesSkipped += list.length - index; break; }
      if (cascade.exhausted()) { queriesSkipped += list.length - index; break; }
      /*
       * Nothing left to spend on a query that could finish. A call that cannot
       * finish is worse than one not made: it spends what is left, returns
       * nothing, and counts a failure against the provider that was about to
       * answer.
       */
      if (remainingMs() < leadCallBudgetMs()) { queriesSkipped += list.length - index; break; }

      if (queriesRun > 0 && concurrency === 1) {
        /*
         * JSearch (RapidAPI) allows one request a second, and the gap is only
         * owed when the previous query did not already take that long. It used
         * to be paid unconditionally — a flat 1.1s before every query — while
         * the call it was spacing takes about 3.4 seconds by itself. Over a
         * dozen queries that is thirteen seconds of a forty-five second budget
         * spent waiting for a limit that had already been satisfied.
         *
         * And it is owed only if the previous query actually reached JSearch.
         * With SerpApi leading the cascade and answering, JSearch is never
         * called at all, so pacing it would spend that second per query on a
         * limit nothing approached.
         */
        const gap = cascade.calledLast("jsearch") ? 1100 : 300;
        const since = Date.now() - lastQueryEndedAt;
        if (since < gap) await new Promise((resolve) => setTimeout(resolve, gap - since));
      }

      const batch = list.slice(index, index + concurrency);
      const timeoutMs = callTimeoutMs();
      const responses = await Promise.all(batch.map(async (query) => ({
        query,
        results: await cascade.run({ ...query, timeoutMs }),
      })));
      for (const { query, results } of responses) {
        for (const result of results) {
          if (!byUrl.has(result.url)) byUrl.set(result.url, result);
        }
        queriesRun++;
        if (query.targetRole) searchedTargetRoles.add(query.targetRole.toLowerCase());
        if (query.employer) searchedEmployers.add(query.employer.toLowerCase());
      }
      lastQueryEndedAt = Date.now();

      if (byUrl.size >= 25 && index + batch.length >= activeLanes.length) {
        queriesSkipped += list.length - index - batch.length;
        break;
      }
    }
  }

  await run(queries);

  /*
   * Direct company career portal search: for target employers that have known
   * ATS endpoints (Workday CXS, Greenhouse), query them directly to fetch
   * authentic first-party listings with direct apply links and 0 CAPTCHAs.
   */
  if (brief.companies.length) {
    /*
     * Said out loud, per employer, because this is the one source that is free,
     * unmetered and aimed exactly where the person pointed it — and it was the
     * least visible thing in the search.
     *
     * Every failure went into an empty catch with a note calling it non-fatal
     * because the aggregator covers it. Two of those three words were wrong: an
     * employer the registry has never heard of returns an empty list rather
     * than throwing, so it was not caught at all, and an aggregator that cannot
     * see a company's own careers page does not cover it. A brief naming four
     * employers could have every one of them silently contribute nothing, and
     * the page would look exactly the same as if they had all been searched.
     */
    const directQueries = brief.companies.slice(0, MAX_COMPANY_QUERIES).map(async (employer) => {
      if (!findEmployerPortal(employer)) {
        employerPortals.push({ employer, status: "unknown", found: 0 });
        return;
      }
      try {
        const terms = earlyCareerPass
          ? entryLevelTermsFor(country).slice(0, 1)
          : activeLanes.map((lane) => toSearchKeywords(lane.name)).filter(Boolean);
        const batches = await Promise.all(terms.map((searchText) => searchEmployerDirectly(employer, {
          employer, searchText, country, limit: 10,
        })));
        const directMatches = deduplicateSearchResults(batches.flat());
        for (const item of directMatches) {
          if (!byUrl.has(item.url)) byUrl.set(item.url, item);
        }
        if (directMatches.length) cascade.used.add("Company Careers");
        searchedEmployers.add(employer.toLowerCase());
        employerPortals.push({
          employer,
          status: directMatches.length ? "searched" : "empty",
          found: directMatches.length,
        });
      } catch (caught) {
        console.error("Employer careers portal failed", { employer, error: caught });
        employerPortals.push({ employer, status: "failed", found: 0 });
      }
    });

    await Promise.allSettled(directQueries);
  }

  if (!byUrl.size && cascade.errors.length) {
    /* The log keeps every word; the person gets the cause without the sales copy. */
    console.error("Jobs search failed", cascade.errors);
    return { ok: false, code: "provider_error", error: `Jobs provider error: ${cascade.errorsThatCostResults().join("; ")}` };
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
      screeningInsight: null,
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
  if (usedLocations.length && strongCount() < MIN_STRONG_BEFORE_WIDENING && !cascade.exhausted() && (Date.now() - startedAt < budgetMs - 2_500)) {
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
  let offMarket = 0;
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
    /*
     * Counted like the other two. This one dropped matches silently, so a
     * misindexed batch that removed the entire page looked identical to a
     * search that found nothing — the one filter whose over-reach left no
     * trace at all.
     */
    if (!isMarketLocationConsistent(match, country)) { offMarket += 1; continue; }
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

  const preLlmResults: ScoredJobMatch[] = deduplicated.slice(0, options.maxResults ?? 20);

  // Add optional semantic context to the deterministic assessment. The model
  // cannot alter the score, recommendation, matched evidence, or ordering.
  const llmScreenedResults = await Promise.all(
    preLlmResults.map(async (match) => {
      try {
        const payload = {
          title: match.title,
          description: match.description.slice(0, 1500), // Prevent context bloat
          candidateSkills: resumeSkills.join(", "),
          candidateLevel: level,
        };

        const response = await Promise.race([
          generateStructuredJson({
            workload: "fast",
            system: "Compare the job description with the candidate context. Return one concise, evidence-based observation that helps the candidate assess the role. Do not calculate a score or recommendation.",
            prompt: JSON.stringify(payload),
            schemaName: "hr_screening",
            schema: {
              type: "object",
              properties: {
                justification: { type: "string" }
              },
              required: ["justification"],
              additionalProperties: false,
            }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
        ]) as { justification: string };

        return withScreeningInsight(match, response.justification);
      } catch (error) {
        console.warn("LLM Screening failed for a job, falling back to heuristic score", error);
        return match; // Fallback to heuristic
      }
    })
  );

  // Filtering and ordering remain entirely evidence-driven; model output is
  // display-only context attached to the same deterministic result.
  const sorted = [...llmScreenedResults].sort((a, b) => b.overallMatch - a.overallMatch);
  const kept = sorted.filter((match) => match.recommendation !== "skip");
  const results: ScoredJobMatch[] = kept.length ? kept : sorted;


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
    unrecognisedTargets: unclassifiedTitles(roleNames).length ? unclassifiedTitles(roleNames) : undefined,
    offMarket,
    families: reachFrom(heldTitles, roleNames),
    countryName: countryLabel,
    countrySource: preferences.country ? "brief" : profile?.country ? "resume" : "default",
    locations: usedLocations,
    broadened,
    companies: brief.companies.slice(0, MAX_COMPANY_QUERIES),
    /*
     * The keywords that were actually sent, read back off the queries.
     *
     * This line used to recompute toSearchKeywords over the lane names, which
     * is a different calculation from the one the search ran: when the planner
     * widened or rewrote a term, the brief on screen still listed the tidy
     * version, so the page confidently described a search that never happened
     * and there was no way to tell from the UI what had been asked for.
     */
    roles: [...new Set(queries.filter((query) => !query.earlyCareerOnly).map((query) => query.keywords))],
    remoteOnly: preferences.remotePreferences.length === 1 && preferences.remotePreferences[0] === "Remote",
    providers: Array.from(cascade.used),
    /*
     * Only the failures that changed what came back. A provider behind the one
     * that answered was never reached, so its trouble is a server-log fact
     * rather than a note under somebody's results.
     */
    providerErrors: (() => {
      const costly = cascade.errorsThatCostResults();
      return costly.length ? costly : undefined;
    })(),
    employerPortals: employerPortals.length ? employerPortals : undefined,
    providerTimeouts: cascade.timeouts.size
      ? [...cascade.timeouts].map(([name, count]) => ({ name, count, waitedMs: cascade.timeoutWaits.get(name) ?? 0 }))
      : undefined,
    queriesRun,
    queriesSkipped,
    targetRolesRequested: activeLanes.length,
    targetRolesSearched: searchedTargetRoles.size,
    employersChecked: searchedEmployers.size,
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
      screeningInsight: nullableText(value.screeningInsight),
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
    providerErrors: strings(value.providerErrors),
    providerTimeouts: Array.isArray(value.providerTimeouts)
      ? value.providerTimeouts.filter((entry) => entry && typeof entry.name === "string").map((entry) => ({
          name: entry.name,
          count: count(entry.count),
          waitedMs: count(entry.waitedMs),
        }))
      : undefined,
    employerPortals: Array.isArray(value.employerPortals)
      ? value.employerPortals.filter((entry) => entry && typeof entry.employer === "string").map((entry) => ({
          employer: entry.employer,
          status: entry.status === "searched" || entry.status === "empty" || entry.status === "failed" ? entry.status : "unknown",
          found: count(entry.found),
        }))
      : undefined,
    queriesRun: count(value.queriesRun),
    queriesSkipped: count(value.queriesSkipped),
    targetRolesRequested: count(value.targetRolesRequested),
    targetRolesSearched: count(value.targetRolesSearched),
    employersChecked: count(value.employersChecked),
  };
}
