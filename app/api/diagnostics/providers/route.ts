import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";
import { getCachedProviderHealth } from "@/lib/ai/diagnostics";

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

  return NextResponse.json(
    {
      summary: usable
        ? `${usable.name} is selected and working.`
        : "The selected provider is not usable. AI work cannot run.",
      checkedAt,
      willUse: usable?.name ?? null,
      providers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
