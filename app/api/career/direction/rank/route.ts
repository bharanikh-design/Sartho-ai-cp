import { NextResponse } from "next/server";
import { z } from "zod";
import {
  groundRoleRankings,
  roleRankingsJsonSchema,
  roleRankingsOutputSchema,
} from "@/lib/career/direction-ranking";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";

/*
 * Ranks the target roles a person already chose against their approved career
 * evidence — the answer to "which of these is my strongest match, and which is
 * a stretch". It reorders and explains; it never adds, removes or saves a role.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z.object({
  lanes: z.array(z.string().trim().min(1).max(180)).min(1).max(20),
  explorationPrompt: z.string().trim().max(1200).optional().default(""),
});

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const input = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: "Add at least one target role before ranking." }, { status: 400 });

  const [profileResult, rolesResult, evidenceResult] = await Promise.all([
    supabase.from("profiles").select("headline,summary,location,work_authorisation,strengths").eq("id", user.id).maybeSingle(),
    supabase.from("career_roles").select("id,employer,title,location,start_date,end_date,is_current,summary").eq("user_id", user.id).order("start_date", { ascending: false }),
    supabase.from("evidence_items").select("id,claim,context,metrics,domains,career_role_id,confidence").eq("user_id", user.id).eq("approval_status", "approved").order("updated_at", { ascending: false }).limit(80),
  ]);
  const dataError = profileResult.error ?? rolesResult.error ?? evidenceResult.error;
  if (dataError) {
    console.error("Unable to prepare career direction ranking", dataError);
    return NextResponse.json({ error: "Sartho could not prepare your Career Profile for ranking." }, { status: 500 });
  }
  if (!evidenceResult.data?.length) {
    return NextResponse.json({ error: "Confirm your Career Profile before ranking roles against it." }, { status: 400 });
  }

  // Same bounded quality-analysis class as direction suggestions and job deep
  // analysis; it shares that allowance rather than opening a new metered path.
  const quota = await checkAiQuota(supabase, "deep_analysis");
  if (!quota.allowed) return aiQuotaResponse(quota);

  try {
    const raw = await generateStructuredJson({
      workload: "quality",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_role_rankings",
      schema: roleRankingsJsonSchema,
      system: [
        "You are Sartho's evidence-grounded career strategist.",
        "For each target role supplied, judge how strongly the person's approved career evidence backs pursuing it now.",
        "match: 'strong' when direct, well-evidenced experience supports it; 'moderate' when the base is real but partial; 'stretch' when it is a credible reach requiring growth; 'unclear' when the evidence does not speak to it.",
        "reason: one plain-language sentence a good talent partner would give — concrete, not flattery.",
        "Cite only supplied evidence IDs, and only ones that genuinely support the verdict. Never invent a skill, employer, metric or responsibility that is not in the evidence.",
        "Judge every supplied role. Do not add roles that were not supplied.",
      ].join(" "),
      prompt: JSON.stringify({
        savedProfile: profileResult.data,
        explorationPrompt: input.data.explorationPrompt,
        careerHistory: rolesResult.data ?? [],
        approvedEvidence: evidenceResult.data,
        rolesToRank: input.data.lanes,
      }),
    });

    const parsed = roleRankingsOutputSchema.parse(raw);
    const rankings = groundRoleRankings(
      parsed,
      evidenceResult.data.map((item) => ({ id: item.id, claim: item.claim })),
      input.data.lanes,
    );

    return NextResponse.json({ rankings });
  } catch (caught) {
    console.error("Career direction ranking failed", caught);
    return NextResponse.json({
      error: "AI could not rank your roles right now. Your priorities are unchanged.",
    }, { status: 500 });
  }
}
