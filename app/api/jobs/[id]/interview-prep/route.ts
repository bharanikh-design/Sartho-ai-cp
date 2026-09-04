import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { logError } from "@/lib/logger";

import {
  groundInterviewPreparation,
  interviewPreparationSchema,
} from "@/lib/interview/grounding";

export const runtime = "nodejs";
export const maxDuration = 120;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["openingAdvice", "questions"],
  properties: {
    openingAdvice: { type: "string" },
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "interviewerIntent", "answerPlan", "evidenceIds", "caution"],
        properties: {
          question: { type: "string" },
          interviewerIntent: { type: "string" },
          answerPlan: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
          evidenceIds: { type: "array", maxItems: 8, items: { type: "string" } },
          caution: { type: "string" },
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
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  const [jobResult, requirementsResult, evidenceResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id,title,employer,location,raw_description,deep_analysis_status,deep_analysis_summary")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("job_requirements")
      .select("requirement_text,requirement_type,assessment,rationale,matched_evidence_ids")
      .eq("job_id", id)
      .order("created_at"),
    supabase
      .from("evidence_items")
      .select("id,claim,context,metrics,domains,source_name,source_locator")
      .eq("user_id", user.id)
      .eq("approval_status", "approved")
      .eq("safe_for_resume", true)
      .order("updated_at", { ascending: false })
      .limit(80),
  ]);

  const dataError = jobResult.error ?? requirementsResult.error ?? evidenceResult.error;
  if (dataError) {
    logError(supabase, "interview_prepare", dataError);
    return NextResponse.json({ error: "Sartho could not prepare this role for interview coaching." }, { status: 500 });
  }
  if (!jobResult.data) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  if (jobResult.data.deep_analysis_status !== "complete" || !requirementsResult.data?.length) {
    return NextResponse.json({ error: "Complete the Career Profile match before generating interview coaching." }, { status: 400 });
  }
  if (!evidenceResult.data?.length) {
    return NextResponse.json({ error: "Approve Career Profile evidence before generating interview coaching." }, { status: 400 });
  }

  // This is the same bounded, evidence-led analysis class as the saved role
  // match, so it shares that allowance in the current live quota schema.
  const quota = await checkAiQuota(supabase, "deep_analysis");
  if (!quota.allowed) return aiQuotaResponse(quota);

  try {
    const raw = await generateStructuredJson({
      workload: "quality",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_interview_preparation",
      schema: jsonSchema,
      system: [
        "You are Sartho's evidence-grounded interview coach for an experienced professional.",
        "Create role-specific questions that test the supplied requirements and recruiter signals.",
        "For experience-based questions, cite only supplied approved evidence IDs and build an answer plan from those facts.",
        "A forward-looking or judgment question may have no evidence citation, but must be clearly framed as a plan or opinion.",
        "Never invent an employer, skill, certification, date, metric, responsibility or result.",
        "The caution must name the most likely overclaim, omission or weak-answer risk.",
        "Do not write a memorised answer; provide a concise structure the user can speak naturally.",
      ].join(" "),
      prompt: JSON.stringify({
        job: jobResult.data,
        requirements: requirementsResult.data,
        approvedEvidence: evidenceResult.data,
      }),
    });

    const parsed = interviewPreparationSchema.parse(raw);
    const preparation = groundInterviewPreparation(
      parsed,
      evidenceResult.data.map((item) => ({ id: item.id, claim: item.claim })),
    );
    return NextResponse.json({ preparation });
  } catch (caught) {
    logError(supabase, "interview_fail", caught);
    return NextResponse.json({
      error: "AI could not create grounded interview coaching right now. The opportunity and Career Profile are unchanged.",
    }, { status: 500 });
  }
}
