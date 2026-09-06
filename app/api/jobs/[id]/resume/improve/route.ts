import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { classifyAiFailure, describeAiFailure, REWRITE_SUBJECT } from "@/lib/ai/failure";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { BULLET_PROPOSE_RULES, BULLET_REWRITE_RULES, inventedNumbersIn } from "@/lib/resume/bullet-rewrite";

/*
 * Rewrite one résumé bullet around a fact the person supplied.
 *
 * This is the honest version of what every résumé tool sells. Teal and Zety
 * will happily turn "Analysed a retail dataset" into "Analysed a 2M-row retail
 * dataset, driving a 15% margin improvement" — numbers nobody gave them. The
 * result passes the filter and then falls apart in the interview, which is
 * worse for the candidate than the weak bullet was.
 *
 * So the loop here has a human in it, and the model is given exactly one job:
 * take the bullet, take the figure the person typed, and write the sentence
 * they would have written if they had thought to include it. It is a rewrite,
 * not a generation. Everything it may say has to come from one of those two
 * inputs.
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

/*
 * Strict about truth, forgiving about shape.
 *
 * These used to be `z.string().min(10).max(600)` and
 * `z.array(z.string().min(4).max(160)).max(4)`, parsed with `.parse()`. So a
 * model that returned five questions instead of four, or one question a little
 * over the cap, threw — and a perfectly good rewritten line was thrown away
 * with it, behind a generic 500 that named none of this.
 *
 * None of those bounds protect anybody. The bound that matters is
 * inventedNumbersIn below, which refuses a figure the person never gave, and
 * that one stays absolute. Everything else is presentation: take what came
 * back, trim it to what fits, and say so plainly when there is nothing usable.
 */
const looseOutputSchema = z.object({
  rewritten: z.string(),
  questions: z.array(z.string()).optional(),
  usedFact: z.boolean().optional(),
});

/** The longest a résumé bullet can plausibly be before it is not one. */
const MAX_BULLET_LENGTH = 600;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rewritten", "usedFact"],
  properties: {
    rewritten: { type: "string" },
    usedFact: { type: "boolean" },
  },
};

/*
 * No array bound in the schema, because the code above enforces it anyway.
 *
 * This carried `maxItems: 4`, and callOpenAI sends every schema with
 * `strict: true`. Strict structured output accepts a restricted subset of JSON
 * Schema and rejects the whole request — a 400, not a retryable model error, so
 * no fallback covers it — when it meets a keyword outside that subset. Which
 * keywords are inside it has changed more than once.
 *
 * The cap is not worth that risk when `.slice(0, 4)` already guarantees it on
 * output. A constraint enforced in two places, one of which can fail the
 * request outright, is a constraint enforced in the wrong place.
 */
const proposeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rewritten", "questions"],
  properties: {
    rewritten: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
  },
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Tell Sartho what the figure was, in a few words." }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id,title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Unable to load the role for a bullet rewrite", error);
    return NextResponse.json({ error: "Sartho could not read this role." }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

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
        roleTitle: job.title,
        bullet: input.data.bullet,
        ...(input.data.fact ? { factFromCandidate: input.data.fact } : {}),
      }),
    });

    const parsed = looseOutputSchema.parse(raw);
    const rewritten = parsed.rewritten.replace(/^[•\-*]\s*/, "").trim();

    if (rewritten.length < 10) {
      console.error("Bullet rewrite came back empty", { length: rewritten.length });
      return NextResponse.json({
        error: "Sartho's AI provider returned an empty line, so your draft is unchanged. Try again.",
      }, { status: 502 });
    }
    if (rewritten.length > MAX_BULLET_LENGTH) {
      console.error("Bullet rewrite came back too long", { length: rewritten.length });
      return NextResponse.json({
        error: "Sartho drafted a paragraph rather than a bullet, so it was discarded. Your draft is unchanged.",
      }, { status: 502 });
    }

    /* Four at most, empties dropped. A long question is still a usable question. */
    const questions = (parsed.questions ?? [])
      .map((question) => question.trim())
      .filter((question) => question.length >= 4)
      .slice(0, 4);

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
      questions: proposing ? questions : [],
      usedFact: proposing ? false : (parsed.usedFact ?? false),
      unchanged: rewritten === input.data.bullet.trim(),
    });
  } catch (caught) {
    console.error("Bullet rewrite failed", caught);

    /*
     * Say which of the things that can go wrong went wrong.
     *
     * This returned "Sartho could not rewrite this line. Your draft is
     * unchanged." for every failure — out of credit, wrong key, retired model,
     * rate limit, malformed output, all of it. The provider had already
     * classified the failure into a sentence naming the lever somebody could
     * pull, and this threw that away, leaving a Try again button that would
     * fail the same way for ever with nothing on screen to explain it.
     *
     * The draft route uses the quality model and this one uses the fast model,
     * so "the résumé generated fine but the rewrite fails" is a real and
     * likely state — and one nobody could diagnose from the old message.
     */
    if (caught instanceof z.ZodError) {
      return NextResponse.json({
        error: "Sartho's AI provider answered in a shape Sartho could not read, so your draft is unchanged. Try again.",
      }, { status: 502 });
    }

    const raw = caught instanceof Error ? caught.message : "";
    const kind = classifyAiFailure(raw);
    return NextResponse.json(
      { error: describeAiFailure(raw, REWRITE_SUBJECT) },
      { status: kind === "rate-limit" ? 429 : 502 },
    );
  }
}
