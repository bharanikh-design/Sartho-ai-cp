import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { countryName, normaliseCountryCode } from "@/lib/jobs/countries";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";
import { MAX_COMPANY_QUERIES, MAX_ROLE_QUERIES, planSearchQueries, toSearchKeywords } from "@/lib/jobs/search-plan";
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

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * Real search: take the saved brief (country, cities, companies, target roles,
 * work model), query the jobs providers, and rank what comes back against the
 * person's own approved evidence. Nothing is saved here — the person still
 * chooses what enters the pipeline. With no provider configured this returns a
 * clear 503 rather than inventing results.
 */
export async function POST() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isJobSearchConfigured()) {
    return NextResponse.json(
      { error: "Jobs search isn't connected yet. Add a provider key (JSEARCH_RAPIDAPI_KEY for Google for Jobs, or ADZUNA_APP_ID / ADZUNA_APP_KEY) to turn on real search.", code: "not_configured" },
      { status: 503 },
    );
  }

  const [{ profile, roles, evidence, lanes }, preferences] = await Promise.all([
    getCareerWorkspace(supabase, user.id),
    getSearchPreferences(supabase, user.id),
  ]);

  const activeLanes = lanes
    .filter((lane) => lane.active)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_ROLE_QUERIES);
  if (!activeLanes.length) {
    return NextResponse.json(
      { error: "Choose your target roles in Career Direction first — that's what Sartho searches for.", code: "no_targets" },
      { status: 400 },
    );
  }

  /*
   * Country resolution, most deliberate signal first: the market the person
   * chose on Search Brief, then the one read from their résumé, then the
   * deployment default (only for briefs saved before country existed).
   */
  const country = normaliseCountryCode(preferences.country)
    ?? normaliseCountryCode(profile?.country)
    ?? defaultJobMarket();
  const countryLabel = countryName(country) ?? country.toUpperCase();

  const providers = providersForCountry(country);
  if (!providers.length) {
    const configured = configuredJobSearchProviders();
    return NextResponse.json(
      {
        error: configured.length
          ? `${countryLabel} isn't covered by the configured jobs provider (Adzuna). Add a JSEARCH_RAPIDAPI_KEY for Google for Jobs, which covers every market.`
          : "Jobs search isn't connected yet.",
        code: "country_unsupported",
      },
      { status: 503 },
    );
  }

  const queries = planSearchQueries({
    roles: activeLanes.map((lane) => lane.name),
    country,
    locations: preferences.targetLocations,
    companies: preferences.targetCompanies,
    remotePreference: preferences.remotePreference,
  });

  /*
   * Queries run sequentially with a short gap so a low rate limit is not
   * tripped by a parallel burst, under a wall-clock budget that leaves room to
   * score and respond inside the route's limit. A single query failing does not
   * sink the whole search — we keep whatever the others returned and only
   * surface an error when nothing came back at all. A provider that fails once
   * is skipped for the rest of this request.
   */
  const startedAt = Date.now();
  const BUDGET_MS = 42_000;
  const dead = new Set<JobSearchProviderName>();
  const byUrl = new Map<string, JobSearchResult>();
  const errors: string[] = [];
  const providersUsed = new Set<string>();
  let queriesRun = 0;
  let queriesSkipped = 0;

  async function run(list: JobSearchQuery[]) {
    for (let index = 0; index < list.length; index++) {
      if (Date.now() - startedAt > BUDGET_MS) { queriesSkipped += list.length - index; break; }
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
    return NextResponse.json({ error: `Jobs provider error: ${errors[errors.length - 1]}`, code: "provider_error" }, { status: 502 });
  }

  // Everything worked but the city filter matched nothing: broaden once to the
  // whole country, so a narrow market doesn't leave the person empty.
  let broadened = false;
  if (!byUrl.size && !errors.length && preferences.targetLocations.length) {
    broadened = true;
    await run(queries.filter((query) => query.location).map((query) => ({ ...query, location: undefined })));
  }

  const ranked = Array.from(byUrl.values())
    .map((result) => {
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
      };
    })
    .sort((a, b) => b.overallMatch - a.overallMatch)
    .slice(0, 20);

  // What was actually searched, so the page can say so instead of leaving the
  // person to guess whether their city or target companies were included.
  const criteria = {
    country,
    countryName: countryLabel,
    countrySource: preferences.country ? "brief" : profile?.country ? "resume" : "default",
    locations: broadened ? [] : preferences.targetLocations.slice(0, 1),
    broadened,
    companies: preferences.targetCompanies.slice(0, MAX_COMPANY_QUERIES),
    roles: activeLanes.map((lane) => toSearchKeywords(lane.name)),
    remoteOnly: preferences.remotePreference === "Remote",
    providers: Array.from(providersUsed),
    queriesRun,
    queriesSkipped,
  };

  return NextResponse.json({ results: ranked, count: ranked.length, criteria });
}
