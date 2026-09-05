import { NextResponse } from "next/server";
import { z } from "zod";
import {
  directionSuggestionsJsonSchema,
  directionSuggestionsOutputSchema,
  groundDirectionSuggestions,
} from "@/lib/career/direction-suggestions";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { logError } from "@/lib/logger";


export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z.object({
  headline: z.string().trim().max(240).optional().default(""),
  summary: z.string().trim().max(4000).optional().default(""),
  explorationPrompt: z.string().trim().max(1200).optional().default(""),
  location: z.string().trim().max(160).optional().default(""),
  workAuthorisation: z.string().trim().max(1000).optional().default(""),
  existingLanes: z.array(z.string().trim().min(1).max(180)).max(20).optional().default([]),
});

/**
 * Record which suggestions the person dismissed. No model runs and no allowance
 * is spent — a dismissal is bookkeeping, and it must survive a page reload or
 * the same rejected roles reappear on every visit.
 */
const dismissSchema = z.object({ dismissed: z.array(z.string().trim().min(1).max(180)).max(60) });

export async function PATCH(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const input = dismissSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { error } = await supabase
    .from("direction_suggestion_sets")
    .update({ dismissed: input.data.dismissed })
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/*
 * Generating a fresh set. This is the only path that spends allowance, so it
 * runs only when the person asks — the page itself reads the stored set.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const input = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: "Review the guidance you gave Sartho." }, { status: 400 });

  const [profileResult, rolesResult, evidenceResult] = await Promise.all([
    supabase.from("profiles").select("headline,summary,location,work_authorisation,strengths").eq("id", user.id).maybeSingle(),
    supabase.from("career_roles").select("id,employer,title,location,start_date,end_date,is_current,summary").eq("user_id", user.id).order("start_date", { ascending: false }),
    supabase.from("evidence_items").select("id,claim,context,metrics,domains,career_role_id,confidence").eq("user_id", user.id).eq("approval_status", "approved").order("updated_at", { ascending: false }).limit(80),
  ]);
  const dataError = profileResult.error ?? rolesResult.error ?? evidenceResult.error;
  if (dataError) {
    logError(supabase, "direction_suggestions_prepare", dataError);
    return NextResponse.json({ error: "Sartho could not prepare your Career Profile for suggestions." }, { status: 500 });
  }
  if (!evidenceResult.data?.length) {
    return NextResponse.json({ error: "Upload your résumé before asking AI for career directions." }, { status: 400 });
  }

  // One bounded call, so it carries its own small allowance rather than drawing
  // on the deep-analysis budget that reviewing a real job needs.
  const quota = await checkAiQuota(supabase, "direction_suggestions");
  if (!quota.allowed) return aiQuotaResponse(quota);

  try {
    const raw = await generateStructuredJson({
      workload: "quality",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_career_direction_suggestions",
      schema: directionSuggestionsJsonSchema,
      system: [
        "You are Sartho's evidence-grounded career strategist.",
        "Propose a balanced set of 5 or 6 role directions: direct continuations, credible adjacent moves, and at most two stretch moves.",
        "Base every suggestion on transferable experience explicitly present in the supplied approved evidence.",
        "A stretch move may require learning, but do not claim the person already has an unsupported skill, certification, employer, metric or responsibility.",
        "Use market-recognisable role families rather than over-specific vacancy titles.",
        "Cite only supplied evidence IDs. Explain why the move is plausible in plain language.",
        "Do not repeat an existing selected priority.",
        "If `steering` is non-empty it is the person's own instruction about what to change: every suggestion must satisfy it (for example a named function, industry, seniority, location or constraint), drop directions that contradict it, and say in each rationale how the direction fits it. Only when it cannot be satisfied by any evidence-backed direction, return the closest evidence-backed directions and say plainly in the rationale why.",
      ].join(" "),
      prompt: JSON.stringify({
        steering: input.data.explorationPrompt,
        savedProfile: profileResult.data,
        currentGuidance: {
          headline: input.data.headline,
          summary: input.data.summary,
          explorationPrompt: input.data.explorationPrompt,
          location: input.data.location,
          workAuthorisation: input.data.workAuthorisation,
        },
        careerHistory: rolesResult.data ?? [],
        approvedEvidence: evidenceResult.data,
        existingSelectedPriorities: input.data.existingLanes,
      }),
    });

    const parsed = directionSuggestionsOutputSchema.parse(raw);
    const suggestions = groundDirectionSuggestions(
      parsed,
      evidenceResult.data.map((item) => ({ id: item.id, claim: item.claim })),
      input.data.existingLanes,
    );
    if (!suggestions.length) throw new Error("The suggestions were not grounded in approved Career Profile evidence.");

    const evidenceCount = evidenceResult.data.length;
    const roleCount = rolesResult.data?.length ?? 0;

    // Stored so the next page visit is a read, not a model call. A fresh set
    // clears old dismissals: these are different roles, and a stale dismissal
    // would silently hide them.
    const { error: cacheError } = await supabase.from("direction_suggestion_sets").upsert({
      user_id: user.id,
      suggestions,
      steering: input.data.explorationPrompt,
      dismissed: [],
      evidence_count: evidenceCount,
      role_count: roleCount,
      generated_at: new Date().toISOString(),
    });
    if (cacheError) logError(supabase, "direction_suggestions_cache", cacheError);

    return NextResponse.json({ suggestions, evidenceCount, roleCount });
  } catch (caught) {
    logError(supabase, "direction_suggestions_fail", caught);
    return NextResponse.json({
      error: "AI could not create grounded suggestions right now. Your Career Profile and selected priorities are unchanged.",
    }, { status: 500 });
  }
}
