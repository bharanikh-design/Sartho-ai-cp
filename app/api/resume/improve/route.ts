import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { BULLET_REWRITE_RULES, inventedNumbersIn } from "@/lib/resume/bullet-rewrite";

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
  /* The number, scale or outcome only this person knows. */
  fact: z.string().trim().min(1).max(400),
});

const outputSchema = z.object({
  rewritten: z.string().trim().min(10).max(600),
  usedFact: z.boolean(),
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

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Tell Sartho what the figure was, in a few words." }, { status: 400 });
  }

  const quota = await checkAiQuota(supabase, "resume_bullet");
  if (!quota.allowed) return aiQuotaResponse(quota);

  try {
    const raw = await generateStructuredJson({
      workload: "fast",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_resume_bullet",
      schema: jsonSchema,
      system: BULLET_REWRITE_RULES,
      prompt: JSON.stringify({
        bullet: input.data.bullet,
        factFromCandidate: input.data.fact,
      }),
    });

    const parsed = outputSchema.parse(raw);
    const rewritten = parsed.rewritten.replace(/^[•\-*]\s*/, "").trim();

    const invented = inventedNumbersIn(rewritten, input.data.bullet, input.data.fact);
    if (invented.length) {
      console.error("Bullet rewrite invented a figure", { invented });
      return NextResponse.json({
        error: `Sartho drafted a figure you did not give it (${invented.join(", ")}), so it was discarded. Try stating the number more plainly.`,
      }, { status: 422 });
    }

    return NextResponse.json({
      rewritten,
      usedFact: parsed.usedFact,
      unchanged: rewritten === input.data.bullet.trim(),
    });
  } catch (caught) {
    console.error("Bullet rewrite failed", caught);
    return NextResponse.json({
      error: "Sartho could not rewrite this line. Your draft is unchanged.",
    }, { status: 500 });
  }
}
