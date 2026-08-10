import { z } from "zod";
import { approvedEvidenceIds, keepGroundedIds } from "@/lib/ai/grounding";

export const interviewQuestionSchema = z.object({
  question: z.string().trim().min(8).max(600),
  interviewerIntent: z.string().trim().min(8).max(800),
  answerPlan: z.array(z.string().trim().min(3).max(600)).min(2).max(5),
  evidenceIds: z.array(z.string()).max(8),
  caution: z.string().trim().min(3).max(600),
});

export const interviewPreparationSchema = z.object({
  openingAdvice: z.string().trim().min(8).max(1200),
  questions: z.array(interviewQuestionSchema).min(3).max(6),
});

export type GroundedInterviewQuestion = z.infer<typeof interviewQuestionSchema> & {
  evidence: Array<{ id: string; claim: string }>;
};

export type GroundedInterviewPreparation = {
  openingAdvice: string;
  questions: GroundedInterviewQuestion[];
};

export function groundInterviewPreparation(
  value: z.infer<typeof interviewPreparationSchema>,
  evidence: Array<{ id: string; claim: string }>,
): GroundedInterviewPreparation {
  const approvedIds = approvedEvidenceIds(evidence);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  return {
    openingAdvice: value.openingAdvice.trim(),
    questions: value.questions.map((question) => {
      const evidenceIds = keepGroundedIds(question.evidenceIds, approvedIds);
      return {
        ...question,
        question: question.question.trim(),
        interviewerIntent: question.interviewerIntent.trim(),
        answerPlan: question.answerPlan.map((step) => step.trim()),
        caution: question.caution.trim(),
        evidenceIds,
        evidence: evidenceIds.flatMap((id) => {
          const item = evidenceById.get(id);
          return item ? [item] : [];
        }),
      };
    }),
  };
}
