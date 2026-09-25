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
import { prepareCareerConductor } from "@/lib/workflow/career-conductor";


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

  let conductor;
  try {
    conductor = await prepareCareerConductor(supabase, user.id);
  } catch (caught) {
    logError(supabase, "direction_suggestions_prepare", caught);
    return NextResponse.json({ error: "Sartho could not prepare your Career Profile for suggestions." }, { status: 500 });
  }

  const { profile, roles, evidence } = conductor.workflow.career;
  const approvedEvidence = evidence
    .filter((item) => item.approval_status === "approved")
    .slice(0, 80);
  if (!approvedEvidence.length) {
    return NextResponse.json({ error: "Upload your résumé before asking AI for career directions." }, { status: 400 });
  }
  const learnedAffinity = conductor.workflow.candidateContext.learnedAffinity.signals
    .slice(0, 6)
    .map((signal) => ({
      concept: signal.value.concept,
      polarity: signal.value.polarity,
      confidence: signal.confidence,
      reason: signal.value.reason,
    }));

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
        /*
         * Two constraints that were missing, and between them they let "Sales
         * Manager / Solutions Consultant" be proposed to a business analyst six
         * months into their career — and then saved as a target role, which is
         * what the job search goes and looks for.
         */
        "totalExperienceYears is how long this person has actually worked. Respect it: under two years means entry level whatever their titles say, and nobody becomes a manager, head, director or engagement manager in that time. Never propose a role more than one grade above the level their experience supports.",
        "Stay in the same line of work as their evidence, or a genuine neighbour of it. Analysis, data, consulting, product and project delivery are neighbours. Sales, pre-sales, marketing and customer success are a different function: do not propose them to someone whose evidence is analytical unless they have asked for that change in `steering`, and if they have, say plainly in the rationale that it is a change of function.",
        "Cite only supplied evidence IDs. Explain why the move is plausible in plain language.",
        "learnedAffinity is weak behavioral context only. It may help choose among evidence-backed directions, but it is not factual evidence and may never justify a capability or override the person's explicit steering.",
        "Do not repeat an existing selected priority.",
        "If `steering` is non-empty it is the person's own instruction about what to change: every suggestion must satisfy it (for example a named function, industry, seniority, location or constraint), drop directions that contradict it, and say in each rationale how the direction fits it. Only when it cannot be satisfied by any evidence-backed direction, return the closest evidence-backed directions and say plainly in the rationale why.",
      ].join(" "),
      prompt: JSON.stringify({
        steering: input.data.explorationPrompt,
        totalExperienceYears: profile?.total_experience_years ?? null,
        savedProfile: profile,
        currentGuidance: {
          headline: input.data.headline,
          summary: input.data.summary,
          explorationPrompt: input.data.explorationPrompt,
          location: input.data.location,
          workAuthorisation: input.data.workAuthorisation,
        },
        careerHistory: roles,
        approvedEvidence: approvedEvidence,
        existingSelectedPriorities: input.data.existingLanes,
        learnedAffinity: learnedAffinity.length ? learnedAffinity : undefined,
      }),
    });

    const parsed = directionSuggestionsOutputSchema.parse(raw);
    /*
     * The person's own steering is what unlocks a change of function: if they
     * typed "I want to move into sales", sales directions are exactly right.
     * Without that, an analytical CV gets analytical directions.
     */
    const steering = (input.data.explorationPrompt ?? "").trim();
    const suggestions = groundDirectionSuggestions(
      parsed,
      approvedEvidence.map((item) => ({ id: item.id, claim: item.claim })),
      input.data.existingLanes,
      {
        heldTitles: (roles).map((role) => role.title).filter(Boolean),
        totalExperienceYears: profile?.total_experience_years ?? null,
        allowFunctionChange: steering.length > 0,
      },
    );
    if (!suggestions.length) throw new Error("The suggestions were not grounded in approved Career Profile evidence.");

    const evidenceCount = approvedEvidence.length;
    const roleCount = roles.length;

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
