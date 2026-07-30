import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructuredJson } from "@/lib/ai/provider";
import { getAuthenticatedUser } from "@/lib/auth";

const bulletSchema = z.object({
  text: z.string().min(5),
  evidenceIds: z.array(z.string()).min(1),
});

const outputSchema = z.object({
  versionName: z.string().min(3),
  headline: z.string().min(3),
  professionalSummary: z.string().min(20),
  sections: z.array(z.object({
    heading: z.string().min(2),
    bullets: z.array(bulletSchema).min(1),
  })).min(1),
  changeLog: z.array(z.object({
    type: z.enum(["emphasised", "reworded", "omitted", "moved"]),
    description: z.string().min(5),
    evidenceIds: z.array(z.string()),
  })),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["versionName", "headline", "professionalSummary", "sections", "changeLog"],
  properties: {
    versionName: { type: "string" },
    headline: { type: "string" },
    professionalSummary: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "bullets"],
        properties: {
          heading: { type: "string" },
          bullets: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "evidenceIds"],
              properties: {
                text: { type: "string" },
                evidenceIds: { type: "array", minItems: 1, items: { type: "string" } },
              },
            },
          },
        },
      },
    },
    changeLog: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "description", "evidenceIds"],
        properties: {
          type: { type: "string", enum: ["emphasised", "reworded", "omitted", "moved"] },
          description: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [jobResult, requirementsResult, evidenceResult] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("job_requirements").select("*").eq("job_id", id),
    supabase
      .from("evidence_items")
      .select("id,claim,context,metrics,domains,source_name,source_locator")
      .eq("user_id", user.id)
      .eq("approval_status", "approved")
      .eq("safe_for_resume", true),
  ]);

  const error = jobResult.error ?? requirementsResult.error ?? evidenceResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!jobResult.data) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!requirementsResult.data?.length || jobResult.data.deep_analysis_status !== "complete") {
    return NextResponse.json({ error: "Complete deep analysis before drafting a tailored résumé." }, { status: 400 });
  }
  if (!evidenceResult.data?.length) {
    return NextResponse.json({ error: "No approved résumé-safe evidence is available." }, { status: 400 });
  }

  try {
    const raw = await generateStructuredJson({
      schemaName: "sartho_tailored_resume",
      schema: jsonSchema,
      system: [
        "You draft a review-only résumé version using only the approved evidence supplied.",
        "Never create or infer an employer, date, skill, metric, certification, responsibility or outcome.",
        "Every bullet must cite at least one supplied evidence ID that directly supports the wording.",
        "Reorder, emphasise or carefully reword evidence to align with the job requirements, but preserve factual meaning.",
        "Do not include contact details, education or certifications unless they appear in the supplied evidence.",
        "The change log must explain every material emphasis, rewording, omission or movement.",
      ].join(" "),
      prompt: JSON.stringify({
        job: {
          title: jobResult.data.title,
          employer: jobResult.data.employer,
          description: jobResult.data.raw_description,
        },
        requirementMapping: requirementsResult.data,
        approvedResumeEvidence: evidenceResult.data,
      }),
    });

    const parsed = outputSchema.parse(raw);
    const approvedIds = new Set(evidenceResult.data.map((item) => item.id));

    const sections = parsed.sections
      .map((section) => ({
        heading: section.heading.trim(),
        bullets: section.bullets
          .map((bullet) => ({
            text: bullet.text.trim(),
            evidenceIds: [...new Set(bullet.evidenceIds.filter((evidenceId) => approvedIds.has(evidenceId)))],
          }))
          .filter((bullet) => bullet.text && bullet.evidenceIds.length),
      }))
      .filter((section) => section.bullets.length);

    if (!sections.length) throw new Error("The draft did not contain any verifiable résumé bullets.");

    const changeLog = parsed.changeLog.map((change) => ({
      type: change.type,
      description: change.description.trim(),
      evidenceIds: [...new Set(change.evidenceIds.filter((evidenceId) => approvedIds.has(evidenceId)))],
    }));

    const evidenceIds = [...new Set(sections.flatMap((section) => section.bullets.flatMap((bullet) => bullet.evidenceIds)))];
    const draft = [
      parsed.headline.trim(),
      "",
      "PROFESSIONAL SUMMARY",
      parsed.professionalSummary.trim(),
      "",
      ...sections.flatMap((section) => [
        section.heading.toUpperCase(),
        ...section.bullets.map((bullet) => `• ${bullet.text}`),
        "",
      ]),
    ].join("\n").trim();

    const { data: applicationId, error: saveError } = await supabase.rpc("save_resume_draft", {
      p_job_id: id,
      p_resume_version: parsed.versionName.trim(),
      p_resume_draft: draft,
      p_change_log: changeLog,
      p_evidence_ids: evidenceIds,
    });
    if (saveError) throw saveError;

    return NextResponse.json({
      applicationId,
      versionName: parsed.versionName.trim(),
      draft,
      changeLog,
      evidenceIds,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Résumé drafting failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
