import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";
import {
  configuredJobSearchProviders,
  searchWithProvider,
  providerCallBudgetMs,
  type JobSearchProviderName,
} from "@/lib/jobs/search-provider";
import { providerLabel } from "@/lib/jobs/provider-cascade";

/*
 * What each provider says to the queries a real search actually sends.
 *
 * The existing probe asks one query — "project manager" — and has now twice
 * reported a provider healthy while every real search came back empty. Both
 * times the difference was something the probe does not exercise: first a
 * hand-built chips parameter, then the words "full time" appended to the
 * query. Both turned a working provider into one that answered nothing, and
 * both were invisible to a probe that asks the simplest possible question.
 *
 * So this asks the real questions. Give it the role titles from a brief and it
 * reports, per query and per provider, how many listings came back and how
 * long it took — which is the difference between knowing why a search is thin
 * and guessing at it. Guessing has cost this project several rounds.
 *
 * It reads nothing and writes nothing. No database, no AI, no saved search.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* A metered allowance is being spent a query at a time, so the ceiling is low. */
const MAX_QUERIES = 6;

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperationsAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const country = (url.searchParams.get("country") ?? "sg").trim().toLowerCase();
  const queries = (url.searchParams.get("q") ?? "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_QUERIES);

  if (!queries.length) {
    return NextResponse.json({
      error: "Pass the queries to try, separated by | — for example ?q=ServiceNow|ITSM manager|Engagement Manager&country=sg",
      note: "These are sent verbatim, exactly as a provider would receive them, so the answer is the one a real search would get.",
    }, { status: 400 });
  }

  const providers: JobSearchProviderName[] = configuredJobSearchProviders();

  /*
   * One query at a time, every provider asked for each. A cascade would stop
   * at the first provider with something to say, which is right for a search
   * and useless here: the whole question is which providers have nothing.
   */
  const rows = [];
  for (const keywords of queries) {
    for (const provider of providers) {
      const startedAt = Date.now();
      try {
        const results = await searchWithProvider(provider, {
          keywords,
          country,
          limit: 10,
          timeoutMs: providerCallBudgetMs(provider),
        });
        rows.push({
          query: keywords,
          provider: providerLabel(provider),
          results: results.length,
          elapsedMs: Date.now() - startedAt,
          /* The first title back, which says more than a count about whether the query landed. */
          sample: results[0]?.title ?? null,
          error: null,
        });
      } catch (caught) {
        rows.push({
          query: keywords,
          provider: providerLabel(provider),
          results: 0,
          elapsedMs: Date.now() - startedAt,
          sample: null,
          error: caught instanceof Error ? caught.message : "unknown error",
        });
      }
    }
  }

  const empty = rows.filter((row) => !row.results && !row.error);
  const failed = rows.filter((row) => row.error);

  return NextResponse.json(
    {
      summary: `${queries.length} quer${queries.length === 1 ? "y" : "ies"} against ${providers.length} provider${providers.length === 1 ? "" : "s"}: `
        + `${rows.length - empty.length - failed.length} answered, ${empty.length} came back empty, ${failed.length} failed.`,
      country,
      order: providers,
      rows,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
