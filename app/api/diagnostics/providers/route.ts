import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";
import { getCachedProviderHealth } from "@/lib/ai/diagnostics";
import { geminiOutputBudget, getProviderRoute, listGeminiModelLimits } from "@/lib/ai/provider";

/*
 * Which AI providers this deployment can actually reach.
 *
 * Every provider problem — a key that was never read, a key that was rejected,
 * an account with no credit — arrives at the person uploading a CV as the same
 * failed import. Telling them apart from the outside meant guessing, and
 * guessing is what turned a five-minute fix into a day.
 *
 * This route is operations-only and never returns a key or any part of one:
 * only the variable's name, whether it is set, and what happened when it was
 * used. The probe itself is cached and only the active provider is contacted.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperationsAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { checkedAt, providers } = await getCachedProviderHealth();
  const usable = providers.find((provider) => provider.selected && provider.reachable);

  /*
   * The one number needed to size GEMINI_MAX_OUTPUT_TOKENS: what the model this
   * deployment actually calls will produce. Reading it from the API beats
   * matching a documentation page against an environment variable by eye, and
   * a reply that overruns this ceiling comes back half-written — which is how a
   * résumé draft failed while reporting only that the provider "could not
   * finish that request".
   */
  let geminiLimits: {
    configured: number;
    models: Array<{ name: string; outputTokenLimit: number | null; usedFor: string[] }>;
  } | null = null;

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey && (process.env.AI_PROVIDER || "openai").trim().toLowerCase() === "gemini") {
    const inUse = new Map<string, string[]>();
    for (const workload of ["fast", "quality"] as const) {
      try {
        const route = getProviderRoute(workload);
        for (const model of [route.primaryModel, route.fallbackModel].filter((name): name is string => Boolean(name))) {
          inUse.set(model, [...(inUse.get(model) ?? []), workload]);
        }
      } catch {
        /* A route that cannot resolve is already reported by the probe above. */
      }
    }
    const limits = await listGeminiModelLimits(geminiKey);
    geminiLimits = {
      configured: geminiOutputBudget(),
      models: limits
        .filter((model) => inUse.has(model.name))
        .map((model) => ({
          name: model.name,
          outputTokenLimit: model.outputTokenLimit,
          usedFor: inUse.get(model.name) ?? [],
        })),
    };
  }

  return NextResponse.json(
    {
      summary: usable
        ? `${usable.name} is selected and working.`
        : "The selected provider is not usable. AI work cannot run.",
      checkedAt,
      willUse: usable?.name ?? null,
      /*
       * Present only on a Gemini deployment. `configured` is what Sartho sends;
       * `outputTokenLimit` is what the model would allow. A configured value
       * below the model's limit is free headroom left on the table, and a long
       * document failing to generate is the first place it shows.
       */
      geminiOutputTokens: geminiLimits,
      providers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
