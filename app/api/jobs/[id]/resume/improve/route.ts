import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";

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

  try {
    const raw = await generateStructuredJson({
      workload: "fast",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_resume_bullet",
      schema: jsonSchema,
      system: [
        "You rewrite a single résumé bullet so that a fact the candidate supplied is stated plainly inside it.",
        "You may use ONLY the supplied bullet and the supplied fact. Never introduce a number, percentage, currency amount, duration, team size, employer, tool, certification or outcome that is not in one of them.",
        "If the supplied fact contains no usable detail, return the original bullet unchanged and set usedFact to false.",
        "Do not exaggerate the fact. If the person says 'about 30 records', do not write '30+' or 'thousands'.",
        "Keep it one sentence, keep their voice, lead with the action, and do not add a closing flourish about impact that the fact does not support.",
        "Return the bullet text only, with no leading bullet character.",
      ].join(" "),
      prompt: JSON.stringify({
        roleTitle: job.title,
        bullet: input.data.bullet,
        factFromCandidate: input.data.fact,
      }),
    });

    const parsed = outputSchema.parse(raw);
    const rewritten = parsed.rewritten.replace(/^[•\-*]\s*/, "").trim();

    /*
     * The model is told not to invent, and is not trusted to have obeyed. A
     * rewrite carrying a number that appears in neither the original bullet nor
     * what the person typed is a fabrication, so it is refused rather than
     * shown for approval — a plausible-looking invented figure is exactly the
     * thing somebody clicks through without reading.
     */
    const permitted = `${input.data.bullet} ${input.data.fact}`;
    const permittedNumbers = new Set(permitted.match(/\d+(?:[.,]\d+)*/g) ?? []);
    const invented = (rewritten.match(/\d+(?:[.,]\d+)*/g) ?? [])
      .filter((number) => !permittedNumbers.has(number));

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
