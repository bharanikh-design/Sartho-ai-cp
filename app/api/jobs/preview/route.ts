import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { evaluateOpportunity, prepareCareerConductor } from "@/lib/workflow/career-conductor";
import { assessSemanticJobs } from "@/lib/context/job-context";
import { createSafetyIdentifier } from "@/lib/ai/provider";
import type { RuleAnalysis } from "@/lib/types";

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

  const conductor = await prepareCareerConductor(supabase, user.id);
  const scored = evaluateOpportunity(conductor, parsed.data.title, parsed.data.description);

  let analysis: RuleAnalysis = scored.analysis;
  try {
    const assessed = await Promise.race([
      assessSemanticJobs(
        conductor.workflow.candidateContext,
        [{
          key: "preview",
          title: parsed.data.title,
          description: parsed.data.description,
        }],
        { safetyIdentifier: createSafetyIdentifier(user.id) },
      ),
      new Promise<Map<string, {
        context: import("@/lib/types").JobSemanticContext;
        fit: import("@/lib/types").SemanticJobFit;
      }>>((_, reject) => setTimeout(() => reject(new Error("Semantic Job Context timed out")), 10_000)),
    ]);
    const semantic = assessed.get("preview");
    if (semantic) {
      analysis = {
        ...analysis,
        semanticContext: semantic.context,
        semanticFit: semantic.fit,
        semanticContextFingerprint: conductor.contextFingerprint,
      };
    }
  } catch (caught) {
    console.warn("Semantic Job Context unavailable for preview; using canonical match", caught);
  }

  return NextResponse.json({ analysis, overallMatch: scored.overallMatch });
}
