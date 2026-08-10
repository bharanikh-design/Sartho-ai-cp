import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { describeAiFailure } from "@/lib/ai/failure";
import { getAuthenticatedUser } from "@/lib/auth";

/*
 * A talent partner's opening read, drawn only from what the person has already
 * approved. It proposes a direction — an ideal next move, what a good next
 * chapter would change, the strengths worth leading with, and a weighted set
 * of target profiles — but proposes is all it does. Nothing here is written to
 * the profile; the editor pre-fills these as drafts the person accepts, edits
 * or discards. It never asserts a fact about the past, so it invents no
 * employer, skill or metric the evidence does not already carry, and it is
 * silent on work authorisation, which is the person's to state, not a model's
 * to guess.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const outputSchema = z.object({
  idealNextMove: z.string().min(3).max(240),
  whatMatters: z.string().min(20).max(2000),
  location: z.string().max(160).nullable(),
  strengths: z.array(z.string().min(1).max(120)).min(1).max(12),
  targetProfiles: z.array(z.object({
    name: z.string().min(2).max(180),
    weight: z.number().min(0).max(100),
  })).min(1).max(6),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["idealNextMove", "whatMatters", "location", "strengths", "targetProfiles"],
  properties: {
    idealNextMove: { type: "string" },
    whatMatters: { type: "string" },
    location: { type: ["string", "null"] },
    strengths: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
    targetProfiles: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "weight"],
        properties: {
          name: { type: "string" },
          weight: { type: "number" },
        },
      },
    },
  },
};

/*
 * Weights are re-based to total 100 so the suggestion arrives balanced, the
 * bar the editor asks for before a direction can activate. Any rounding drift
 * is folded into the largest profile so the sum is exact.
 */
function normaliseWeights(profiles: Array<{ name: string; weight: number }>) {
  const total = profiles.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    const even = Math.floor(100 / profiles.length);
    const rebalanced = profiles.map((item) => ({ ...item, weight: even }));
    rebalanced[0].weight += 100 - even * profiles.length;
    return rebalanced;
  }
  const scaled = profiles.map((item) => ({ ...item, weight: Math.round((item.weight / total) * 100) }));
  const drift = 100 - scaled.reduce((sum, item) => sum + item.weight, 0);
  if (drift !== 0) {
    const largest = scaled.reduce((best, item, index) => item.weight > scaled[best].weight ? index : best, 0);
    scaled[largest].weight += drift;
  }
  return scaled;
}

export async function POST() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [rolesResult, evidenceResult, profileResult] = await Promise.all([
    supabase.from("career_roles").select("employer,title,start_date,end_date,is_current,summary").eq("user_id", user.id),
    supabase
      .from("evidence_items")
      .select("claim,context,metrics,domains")
      .eq("user_id", user.id)
      .eq("approval_status", "approved"),
    supabase.from("profiles").select("headline,summary,location").eq("id", user.id).maybeSingle(),
  ]);

  if (rolesResult.error || evidenceResult.error || profileResult.error) {
    console.error("Unable to prepare career suggestions", rolesResult.error ?? evidenceResult.error ?? profileResult.error);
    return NextResponse.json({ error: "Sartho could not read your Career Profile." }, { status: 500 });
  }
  if (!evidenceResult.data?.length) {
    return NextResponse.json({ error: "Confirm your Career Profile first — Sartho suggests a direction from your approved evidence." }, { status: 400 });
  }

  const quota = await checkAiQuota(supabase, "career_suggestions");
  if (!quota.allowed) return aiQuotaResponse(quota);

  try {
    const raw = await generateStructuredJson({
      workload: "quality",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_career_direction",
      schema: jsonSchema,
      system: [
        "You are a senior talent partner proposing a career direction, not writing a résumé.",
        "Work only from the supplied approved evidence and roles. Never invent an employer, skill, metric or achievement that is not present.",
        "idealNextMove: one concrete role and context this person is credibly ready for next.",
        "whatMatters: two or three sentences on the scope, impact and environment their evidence suggests they should seek.",
        "location: infer only from the roles or profile; use null if genuinely unclear. Say nothing about visas or work authorisation — that is the person's to state.",
        "strengths: the recurring, evidence-backed themes worth leading with, in the person's own domain language.",
        "targetProfiles: two to five role families to pursue, each with a weight reflecting how strongly the evidence points there. Weights should total roughly 100.",
      ].join(" "),
      prompt: JSON.stringify({
        currentProfile: profileResult.data ?? null,
        roles: rolesResult.data,
        approvedEvidence: evidenceResult.data,
      }),
    });

    const parsed = outputSchema.parse(raw);
    return NextResponse.json({
      idealNextMove: parsed.idealNextMove.trim(),
      whatMatters: parsed.whatMatters.trim(),
      location: parsed.location?.trim() || null,
      strengths: [...new Set(parsed.strengths.map((item) => item.trim()).filter(Boolean))],
      targetProfiles: normaliseWeights(
        parsed.targetProfiles.map((item) => ({ name: item.name.trim(), weight: item.weight })).filter((item) => item.name),
      ),
    });
  } catch (caught) {
    console.error("Career suggestions failed", caught);
    const message = caught instanceof Error ? describeAiFailure(caught.message) : "Sartho could not suggest a direction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
