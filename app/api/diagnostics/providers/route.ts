import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { probeProviders } from "@/lib/ai/provider";

/*
 * Which AI providers this deployment can actually reach.
 *
 * Every provider problem — a key that was never read, a key that was rejected,
 * an account with no credit — arrives at the person uploading a CV as the same
 * failed import. Telling them apart from the outside meant guessing, and
 * guessing is what turned a five-minute fix into a day.
 *
 * Behind the same authentication as everything else, and it never returns a
 * key or any part of one: only the variable's name, whether it is set, and
 * what happened when it was used.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const providers = await probeProviders();
  const usable = providers.find((provider) => provider.reachable);

  return NextResponse.json(
    {
      summary: usable
        ? `${usable.name} is working. Imports will use it.`
        : "No provider is usable. Résumé imports cannot run.",
      willUse: usable?.name ?? null,
      providers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
