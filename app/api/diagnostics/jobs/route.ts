import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";
import { configuredJobSearchProviders, probeJobProvider, type JobSearchProviderName } from "@/lib/jobs/search-provider";

/*
 * Which jobs providers this deployment can actually reach.
 *
 * The sibling route answers this for the AI providers, and the jobs side needed
 * it for exactly the same reason: every provider problem arrives at the person
 * as one empty page. A key that was never set, a key that was rejected, a plan
 * out of quota, an API that is merely slow — all four look identical from the
 * outside, and the only way to tell them apart was to guess.
 *
 * There was once a debug endpoint for this. It was unauthenticated in spirit,
 * hardcoded a New York query, and on a missing key replied with the names of
 * every environment variable matching /API/. This is the same answer without
 * any of that: operations-only, and it returns variable names and outcomes,
 * never a key or any part of one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALL_PROVIDERS: JobSearchProviderName[] = ["jsearch", "adzuna"];

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperationsAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  /*
   * Every provider is probed, not only the configured ones, so the answer to
   * "why is Google for Jobs missing from my results" is on the page whether the
   * cause is a missing key or a failing one.
   */
  const order = configuredJobSearchProviders();
  const providers = await Promise.all(ALL_PROVIDERS.map((provider) => probeJobProvider(provider)));

  const working = providers.filter((provider) => provider.reachable);
  const preferred = order[0] ? providers.find((provider) => provider.provider === order[0]) : undefined;

  return NextResponse.json(
    {
      summary: !working.length
        ? "No jobs provider is reachable. Search cannot return anything."
        : preferred?.reachable
          ? `${preferred.name} is answering first, with ${working.length} provider${working.length === 1 ? "" : "s"} reachable.`
          : `${preferred?.name ?? "The preferred provider"} is not answering — search is falling back to ${working[0].name}.`,
      checkedAt: new Date().toISOString(),
      /* The order the cascade tries them in, so a surprise is visible as one. */
      order: order.length ? order : null,
      providers,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
