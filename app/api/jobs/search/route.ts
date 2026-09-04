import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";
import {
  isJobSearchConfigured,
  configuredJobSearchProviders,
  searchWithProvider,
  JobSearchNotConfiguredError,
  type JobSearchResult,
} from "@/lib/jobs/search-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * Real search: take the saved brief (target roles + locations), query the jobs
 * provider, and rank what comes back against the person's own approved
 * evidence. Nothing is saved here — the person still chooses what enters the
 * pipeline. With no provider configured this returns a clear 503 rather than
 * inventing results.
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

  const [{ roles, evidence, lanes }, preferences] = await Promise.all([
    getCareerWorkspace(supabase, user.id),
    getSearchPreferences(supabase, user.id),
  ]);

  const activeLanes = lanes
    .filter((lane) => lane.active)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
  if (!activeLanes.length) {
    return NextResponse.json(
      { error: "Choose your target roles in Career Direction first — that's what Sartho searches for.", code: "no_targets" },
      { status: 400 },
    );
  }

  const location = preferences.targetLocations[0];

  /*
   * One bounded query per priority role, run sequentially with a short gap so a
   * low free-tier rate limit is not tripped by a parallel burst. A single query
   * failing (rate-limit or otherwise) does not sink the whole search — we keep
   * whatever the other queries returned and only surface an error when nothing
   * came back at all.
   */
  const providers = configuredJobSearchProviders();
  const dead = new Set<string>(); // a provider that failed once is skipped for the rest of this request
  const byUrl = new Map<string, JobSearchResult>();
  const errors: string[] = [];
  for (let index = 0; index < activeLanes.length; index++) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1200));
    for (const provider of providers) {
      if (dead.has(provider)) continue;
      try {
        const batch = await searchWithProvider(provider, { keywords: activeLanes[index].name, location, limit: 20 });
        for (const result of batch) {
          if (!byUrl.has(result.url)) byUrl.set(result.url, result);
        }
        break; // this provider answered; move to the next role
      } catch (caught) {
        if (caught instanceof JobSearchNotConfiguredError) { dead.add(provider); continue; }
        errors.push(`${provider}: ${caught instanceof Error ? caught.message : "unknown error"}`);
        dead.add(provider); // fall through to the next provider for this and later roles
      }
    }
  }

  if (!byUrl.size && errors.length) {
    console.error("Jobs search failed", errors);
    return NextResponse.json({ error: `Jobs provider error: ${errors[errors.length - 1]}`, code: "provider_error" }, { status: 502 });
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

  return NextResponse.json({ results: ranked, count: ranked.length });
}
