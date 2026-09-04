import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";

/*
 * Analyse a role without saving it.
 *
 * This is the exact same scorer the save path uses (scoreOpportunity), so the
 * fit shown here before you save is the fit that gets stored — there is no
 * second, divergent matcher, and nothing depends on an embeddings sync having
 * run.
 */
const previewSchema = z.object({
  title: z.string().trim().max(240).optional().default(""),
  description: z.string().trim().min(1).max(80_000),
});

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the job description to analyse it." }, { status: 400 });

  const { roles, evidence, lanes } = await getCareerWorkspace(supabase, user.id);
  const scored = scoreOpportunity(parsed.data.title, parsed.data.description, evidence, roles, lanes);

  return NextResponse.json({ analysis: scored.analysis, overallMatch: scored.overallMatch });
}
