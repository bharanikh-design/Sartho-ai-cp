import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructuredJson } from "@/lib/ai/provider";
import { getAuthenticatedUser } from "@/lib/auth";
import type { DeepAnalysisSummary, RequirementAssessment } from "@/lib/types";

const requirementSchema = z.object({
  requirementText: z.string().min(3),
  requirementType: z.enum(["mandatory", "preferred", "contextual"]),
  category: z.string().min(1),
  matchedEvidenceIds: z.array(z.string()),
  assessment: z.enum(["met", "partially_met", "not_met", "unknown"]),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string().min(1),
});

const outputSchema = z.object({
  requirements: z.array(requirementSchema).min(1).max(60),
  recruiterSignals: z.array(z.string()).max(12),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requirements", "recruiterSignals"],
  properties: {
    requirements: {
      type: "array",
      minItems: 1,
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirementText", "requirementType", "category", "matchedEvidenceIds", "assessment", "confidence", "rationale"],
        properties: {
          requirementText: { type: "string" },
          requirementType: { type: "string", enum: ["mandatory", "preferred", "contextual"] },
          category: { type: "string" },
          matchedEvidenceIds: { type: "array", items: { type: "string" } },
          assessment: { type: "string", enum: ["met", "partially_met", "not_met", "unknown"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          rationale: { type: "string" },
        },
      },
    },
    recruiterSignals: { type: "array", maxItems: 12, items: { type: "string" } },
  },
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [jobResult, evidenceResult] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("evidence_items")
      .select("id,claim,context,metrics,domains,source_name,source_locator,confidence")
      .eq("user_id", user.id)
      .eq("approval_status", "approved"),
  ]);

  if (jobResult.error) return NextResponse.json({ error: jobResult.error.message }, { status: 400 });
  if (evidenceResult.error) return NextResponse.json({ error: evidenceResult.error.message }, { status: 400 });
  if (!jobResult.data) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!evidenceResult.data?.length) {
    return NextResponse.json({ error: "Approve Career Profile evidence before running deep analysis." }, { status: 400 });
  }

  await supabase.from("jobs").update({ deep_analysis_status: "processing" }).eq("id", id).eq("user_id", user.id);

  try {
    const raw = await generateStructuredJson({
      schemaName: "sartho_job_evidence_analysis",
      schema: jsonSchema,
      system: [
        "You are Sartho's evidence auditor, not a résumé marketer.",
        "Extract every meaningful job requirement and assess it only against the supplied approved evidence.",
        "Never infer a skill, employer, date, metric, certification or responsibility that is not explicitly supported.",
        "Every met or partially_met assessment must cite one or more supplied evidence IDs.",
        "When evidence is absent or ambiguous, use not_met or unknown honestly.",
        "Separate explicit job requirements from likely recruiter signals. Recruiter signals are inference, not fact.",
      ].join(" "),
      prompt: JSON.stringify({
        job: {
          title: jobResult.data.title,
          employer: jobResult.data.employer,
          location: jobResult.data.location,
          description: jobResult.data.raw_description,
        },
        approvedEvidence: evidenceResult.data,
      }),
    });

    const parsed = outputSchema.parse(raw);
    const approvedIds = new Set(evidenceResult.data.map((item) => item.id));

    const requirements = parsed.requirements.map((item) => {
      const matchedEvidenceIds = [...new Set(item.matchedEvidenceIds.filter((evidenceId) => approvedIds.has(evidenceId)))];
      let assessment: RequirementAssessment = item.assessment;
      if ((assessment === "met" || assessment === "partially_met") && !matchedEvidenceIds.length) assessment = "unknown";

      return {
        requirement_text: item.requirementText.trim(),
        requirement_type: item.requirementType,
        category: item.category.trim(),
        matched_evidence_ids: matchedEvidenceIds,
        assessment,
        confidence: matchedEvidenceIds.length ? item.confidence : "low",
        rationale: item.rationale.trim(),
      };
    });

    const mandatory = requirements.filter((item) => item.requirement_type === "mandatory");
    const preferred = requirements.filter((item) => item.requirement_type === "preferred");
    const countedAsMet = (assessment: RequirementAssessment) => assessment === "met" || assessment === "partially_met";

    const summary: DeepAnalysisSummary = {
      mandatoryMet: mandatory.filter((item) => countedAsMet(item.assessment)).length,
      mandatoryTotal: mandatory.length,
      preferredMet: preferred.filter((item) => countedAsMet(item.assessment)).length,
      preferredTotal: preferred.length,
      strongestMatches: requirements.filter((item) => item.assessment === "met").slice(0, 5).map((item) => item.requirement_text),
      honestGaps: requirements.filter((item) => item.requirement_type === "mandatory" && (item.assessment === "not_met" || item.assessment === "unknown")).map((item) => item.requirement_text),
      recruiterSignals: parsed.recruiterSignals.map((item) => item.trim()).filter(Boolean),
    };

    const { error: replaceError } = await supabase.rpc("replace_job_requirements", {
      p_job_id: id,
      p_requirements: requirements,
      p_summary: summary,
    });
    if (replaceError) throw replaceError;

    return NextResponse.json({ requirements, summary });
  } catch (caught) {
    await supabase.from("jobs").update({ deep_analysis_status: "failed" }).eq("id", id).eq("user_id", user.id);
    const message = caught instanceof Error ? caught.message : "Deep analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
