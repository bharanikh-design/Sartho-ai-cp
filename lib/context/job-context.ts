import { z } from "zod";
import { generateStructuredJson } from "@/lib/ai/provider";
import type { CandidateContext } from "@/lib/context/candidate-context";
import type { JobSemanticContext, SemanticJobFit } from "@/lib/types";

export const MAX_SEMANTIC_JOBS_PER_PASS = 8;

export const jobSemanticContextSchema = z.object({
  function: z.string().trim().min(2).max(120),
  specialties: z.array(z.string().trim().min(1).max(120)).max(8),
  seniority: z.enum(["entry", "individual", "manager", "senior_manager", "director", "executive", "unknown"]),
  roleShape: z.enum(["hands_on", "delivery_leadership", "advisory", "people_leadership", "commercial", "mixed", "unknown"]),
  primaryOutcome: z.string().trim().min(3).max(240),
  responsibilities: z.array(z.string().trim().min(2).max(180)).max(6),
  mandatoryExpertise: z.array(z.string().trim().min(1).max(140)).max(8),
  domainContext: z.array(z.string().trim().min(1).max(120)).max(6),
}).strict();

export const semanticJobFitSchema = z.object({
  relation: z.enum(["aligned", "adjacent", "conflict", "unclear"]),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string().trim().min(5).max(420),
  conflictDimensions: z.array(z.enum(["function", "specialism", "seniority", "role_shape"])).max(4),
  supportingEvidenceRefs: z.array(z.string()).max(12),
}).strict();

const semanticAssessmentSchema = z.object({
  jobs: z.array(z.object({
    key: z.string(),
    context: jobSemanticContextSchema,
    fit: semanticJobFitSchema,
  }).strict()).max(MAX_SEMANTIC_JOBS_PER_PASS),
}).strict();

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["jobs"],
  properties: {
    jobs: {
      type: "array",
      maxItems: MAX_SEMANTIC_JOBS_PER_PASS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "context", "fit"],
        properties: {
          key: { type: "string" },
          context: {
            type: "object",
            additionalProperties: false,
            required: ["function", "specialties", "seniority", "roleShape", "primaryOutcome", "responsibilities", "mandatoryExpertise", "domainContext"],
            properties: {
              function: { type: "string" },
              specialties: { type: "array", maxItems: 8, items: { type: "string" } },
              seniority: { type: "string", enum: ["entry", "individual", "manager", "senior_manager", "director", "executive", "unknown"] },
              roleShape: { type: "string", enum: ["hands_on", "delivery_leadership", "advisory", "people_leadership", "commercial", "mixed", "unknown"] },
              primaryOutcome: { type: "string" },
              responsibilities: { type: "array", maxItems: 6, items: { type: "string" } },
              mandatoryExpertise: { type: "array", maxItems: 8, items: { type: "string" } },
              domainContext: { type: "array", maxItems: 6, items: { type: "string" } },
            },
          },
          fit: {
            type: "object",
            additionalProperties: false,
            required: ["relation", "confidence", "reason", "conflictDimensions", "supportingEvidenceRefs"],
            properties: {
              relation: { type: "string", enum: ["aligned", "adjacent", "conflict", "unclear"] },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              reason: { type: "string" },
              conflictDimensions: {
                type: "array",
                maxItems: 4,
                items: { type: "string", enum: ["function", "specialism", "seniority", "role_shape"] },
              },
              supportingEvidenceRefs: { type: "array", maxItems: 12, items: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

export type SemanticJobInput = {
  key: string;
  title: string;
  description: string;
  employer?: string | null;
  location?: string | null;
};

function candidatePayload(context: CandidateContext) {
  return {
    careerTruth: {
      headline: context.careerTruth.headline?.value ?? null,
      summary: context.careerTruth.summary?.value ?? null,
      yearsExperience: context.careerTruth.yearsExperience?.value ?? null,
      heldRoles: context.careerTruth.heldRoles.map((signal) => ({
        ...signal.value,
        refs: signal.evidenceRefs,
      })),
      capabilities: context.careerTruth.capabilities.slice(0, 30).map((signal) => ({
        ...signal.value,
        refs: signal.evidenceRefs,
      })),
      explicitExclusions: context.careerTruth.explicitExclusions.map((signal) => signal.value),
    },
    explicitIntent: {
      targetRoles: context.explicitIntent.targetRoles.map((signal) => signal.value),
    },
    learnedAffinity: context.learnedAffinity.signals
      .filter((signal) => signal.confidence >= 0.5)
      .slice(0, 6)
      .map((signal) => ({
        ...signal.value,
        confidence: signal.confidence,
      })),
  };
}

function allowedEvidenceRefs(context: CandidateContext): Set<string> {
  return new Set([
    ...context.careerTruth.heldRoles.flatMap((signal) => signal.evidenceRefs),
    ...context.careerTruth.capabilities.flatMap((signal) => signal.evidenceRefs),
    ...context.explicitIntent.targetRoles.flatMap((signal) => signal.evidenceRefs),
  ]);
}

export function groundSemanticAssessments(
  context: CandidateContext,
  jobs: SemanticJobInput[],
  raw: unknown,
): Map<string, { context: JobSemanticContext; fit: SemanticJobFit }> {
  const selected = jobs.slice(0, MAX_SEMANTIC_JOBS_PER_PASS);
  return groundSemanticAssessments(context, selected, raw);
}

export async function assessSemanticJobs(
  context: CandidateContext,
  jobs: SemanticJobInput[],
  options: { safetyIdentifier?: string } = {},
): Promise<Map<string, { context: JobSemanticContext; fit: SemanticJobFit }>> {
  const selected = jobs.slice(0, MAX_SEMANTIC_JOBS_PER_PASS);
  if (!selected.length) return new Map();

  const raw = await generateStructuredJson({
    workload: "fast",
    safetyIdentifier: options.safetyIdentifier,
    schemaName: "sartho_semantic_job_context",
    schema: jsonSchema,
    system: [
      "You are Sartho's semantic job analyst.",
      "Understand each job by the work it actually is, not by keyword overlap.",
      "Describe function, specialist domain, seniority, role shape, primary outcome, responsibilities and mandatory expertise in concise market language.",
      "Then compare that job meaning with the supplied candidate context.",
      "Career Truth and explicit target roles are authoritative. Learned affinity is weak preference context only and never factual evidence.",
      "aligned means the job is substantially the same work/direction; adjacent means a credible neighboring move; conflict means generic transferable skills may overlap but the actual function, specialist domain, seniority or role shape is materially incompatible; unclear means the advert is insufficient.",
      "Do not reward generic words such as manager, project, transformation, stakeholder or consultant when the specialist work underneath them differs.",
      "Do not calculate a match percentage or recommendation. This is a semantic guard/explanation layer, not a second scoring engine.",
      "supportingEvidenceRefs may cite only refs present in the candidate payload.",
      "Return exactly one result for each supplied key.",
    ].join(" "),
    prompt: JSON.stringify({
      candidate: candidatePayload(context),
      jobs: selected.map((job) => ({
        key: job.key,
        title: job.title,
        employer: job.employer ?? null,
        location: job.location ?? null,
        description: job.description.slice(0, 6000),
      })),
    }),
  });

  const parsed = semanticAssessmentSchema.parse(raw);
  const requested = new Set(selected.map((job) => job.key));
  const allowedRefs = allowedEvidenceRefs(context);
  const result = new Map<string, { context: JobSemanticContext; fit: SemanticJobFit }>();

  for (const item of parsed.jobs) {
    if (!requested.has(item.key) || result.has(item.key)) continue;
    result.set(item.key, {
      context: item.context,
      fit: {
        ...item.fit,
        supportingEvidenceRefs: item.fit.supportingEvidenceRefs.filter((ref) => allowedRefs.has(ref)),
      },
    });
  }

  return result;
}
