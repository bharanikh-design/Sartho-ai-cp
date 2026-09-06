import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { BULLET_PROPOSE_RULES, BULLET_REWRITE_RULES, inventedNumbersIn } from "@/lib/resume/bullet-rewrite";

/*
 * Rewrite one bullet of a résumé that is not aimed at any particular role.
 *
 * The same loop the job-specific route runs, for the workbench: somebody
 * improving a résumé they already have, before deciding to make it their
 * master. There is no advert to aim at, so the model gets the bullet and the
 * fact and nothing else — which if anything makes the no-invention rule easier
 * to hold. Both routes share BULLET_REWRITE_RULES and the same guard, so they
 * cannot drift apart on what they will and will not say.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z.object({
  bullet: z.string().trim().min(10).max(600),
  /*
   * The number, scale or outcome only this person knows. Absent on the first
   * call: the model goes first, drafting the stronger line with every quantity
   * it cannot know left as a labelled blank for them to fill.
   */
  fact: z.string().trim().min(1).max(400).optional(),
});

const outputSchema = z.object({
  rewritten: z.string().trim().min(10).max(600),
  usedFact: z.boolean(),
});

/* Propose mode also names what would make the line strongest. */
const proposeSchema = z.object({
  rewritten: z.string().trim().min(10).max(600),
  questions: z.array(z.string().trim().min(4).max(160)).max(4).default([]),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rewritten", "usedFact"],
  properties: {
    rewritten: { type: "string" },
    usedFact: { type: "boolean" },
  },
};

const proposeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rewritten", "questions"],
  properties: {
    rewritten: { type: "string" },
    questions: { type: "array", maxItems: 4, items: { type: "string" } },
  },
};

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Tell Sartho what the figure was, in a few words." }, { status: 400 });
  }

  const quota = await checkAiQuota(supabase, "resume_bullet");
  if (!quota.allowed) return aiQuotaResponse(quota);

  const proposing = !input.data.fact;

  try {
    const raw = await generateStructuredJson({
      workload: "fast",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: proposing ? "sartho_resume_bullet_proposal" : "sartho_resume_bullet",
      schema: proposing ? proposeJsonSchema : jsonSchema,
      system: proposing ? BULLET_PROPOSE_RULES : BULLET_REWRITE_RULES,
      prompt: JSON.stringify({
        bullet: input.data.bullet,
        ...(input.data.fact ? { factFromCandidate: input.data.fact } : {}),
      }),
    });

    const parsed = proposing ? proposeSchema.parse(raw) : outputSchema.parse(raw);
    const rewritten = parsed.rewritten.replace(/^[•\-*]\s*/, "").trim();

    /*
     * The same guard both ways. Proposing, the only permitted figures are the
     * ones already in the bullet — everything else must have come back as a
     * blank, so a number here is exactly the invention this refuses.
     */
    const invented = inventedNumbersIn(rewritten, input.data.bullet, input.data.fact ?? "");
    if (invented.length) {
      console.error("Bullet rewrite invented a figure", { invented });
      return NextResponse.json({
        error: `Sartho drafted a figure you did not give it (${invented.join(", ")}), so it was discarded. Try stating the number more plainly.`,
      }, { status: 422 });
    }

    return NextResponse.json({
      rewritten,
      proposed: proposing,
      questions: proposing ? (parsed as z.infer<typeof proposeSchema>).questions : [],
      usedFact: proposing ? false : (parsed as z.infer<typeof outputSchema>).usedFact,
      unchanged: rewritten === input.data.bullet.trim(),
    });
  } catch (caught) {
    console.error("Bullet rewrite failed", caught);
    return NextResponse.json({
      error: "Sartho could not rewrite this line. Your draft is unchanged.",
    }, { status: 500 });
  }
}
