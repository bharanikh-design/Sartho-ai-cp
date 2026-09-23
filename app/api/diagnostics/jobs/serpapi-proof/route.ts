import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";
import { searchWithProvider } from "@/lib/jobs/search-provider";
import { serpApiAccount, serpApiConfig } from "@/lib/jobs/serpapi";

/*
 * One production-proof check for Google Jobs.
 *
 * This is deliberately operations-only and never returns the API key. It asks
 * SerpApi for a small, ordinary market query, then reports whether Sartho can
 * turn the answer into usable opportunity records. A 200 from SerpApi is not
 * proof; mapped, clickable jobs are.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperationsAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!serpApiConfig()) return NextResponse.json({ ok: false, stage: "configuration", error: "SerpApi is not configured." }, { status: 503 });

  const started = Date.now();
  const account = await serpApiAccount().catch((error) => ({ error: error instanceof Error ? error.message : "Account check failed." }));
  try {
    const results = await searchWithProvider("serpapi", {
      keywords: "project manager",
      location: "Singapore",
      country: "SG",
      limit: 10,
    });
    const usable = results.filter((job) => job.title && job.description && job.url);
    const direct = usable.filter((job) => job.applyDirect);
    return NextResponse.json({
      ok: usable.length > 0,
      stage: usable.length ? "mapped-results" : "empty-results",
      elapsedMs: Date.now() - started,
      account,
      received: results.length,
      usable: usable.length,
      directApply: direct.length,
      sources: [...new Set(usable.flatMap((job) => job.platforms))].slice(0, 12),
      sample: usable.slice(0, 5).map((job) => ({
        title: job.title,
        employer: job.employer,
        location: job.location,
        descriptionCharacters: job.description.length,
        directApply: job.applyDirect,
        platforms: job.platforms,
        urlHost: (() => { try { return new URL(job.url).hostname; } catch { return null; } })(),
      })),
    }, { status: usable.length ? 200 : 502, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "provider",
      elapsedMs: Date.now() - started,
      account,
      error: error instanceof Error ? error.message : "SerpApi production proof failed.",
    }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
