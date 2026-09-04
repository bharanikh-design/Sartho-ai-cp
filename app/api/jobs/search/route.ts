import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";
import {
  isJobSearchConfigured,
  searchJobs,
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
      { error: "Jobs search isn't connected yet. Add a provider key (ADZUNA_APP_ID / ADZUNA_APP_KEY) to turn on real search.", code: "not_configured" },
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

  // One bounded query per priority role, merged and de-duplicated by link.
  const byUrl = new Map<string, JobSearchResult>();
  try {
    const batches = await Promise.all(
      activeLanes.map((lane) => searchJobs({ keywords: lane.name, location, limit: 20 })),
    );
    for (const batch of batches) {
      for (const result of batch) {
        if (!byUrl.has(result.url)) byUrl.set(result.url, result);
      }
    }
  } catch (caught) {
    if (caught instanceof JobSearchNotConfiguredError) {
      return NextResponse.json({ error: "Jobs search isn't connected yet.", code: "not_configured" }, { status: 503 });
    }
    console.error("Jobs search failed", caught);
    return NextResponse.json({ error: "The jobs provider could not be reached. Try again shortly." }, { status: 502 });
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
