import { describe, expect, it } from "vitest";
import { groundInterviewPreparation } from "./grounding";

const preparation = {
  openingAdvice: "Lead with the decision you made before describing the context.",
  questions: [
    {
      question: "Tell me about a transformation programme you personally led.",
      interviewerIntent: "Tests ownership, scale and delivery judgment.",
      answerPlan: ["State the mandate.", "Explain your decision.", "Close with the supported outcome."],
      evidenceIds: ["approved-1", "invented", "approved-1"],
      caution: "Do not claim metrics that are not in the approved evidence.",
    },
    {
      question: "How do you handle resistance from senior stakeholders?",
      interviewerIntent: "Tests influence and conflict management.",
      answerPlan: ["Name the disagreement.", "Explain the trade-off."],
      evidenceIds: [],
      caution: "Use a real example rather than a hypothetical answer.",
    },
    {
      question: "How would you begin your first ninety days in this role?",
      interviewerIntent: "Tests prioritisation and understanding of the role.",
      answerPlan: ["Start with discovery.", "Name the first decision."],
      evidenceIds: [],
      caution: "Present this as a plan, not as past experience.",
    },
  ],
};

describe("interview preparation grounding", () => {
  it("removes invented and duplicate evidence citations", () => {
    const grounded = groundInterviewPreparation(preparation, [
      { id: "approved-1", claim: "Led a regional transformation programme." },
    ]);

    expect(grounded.questions[0].evidenceIds).toEqual(["approved-1"]);
    expect(grounded.questions[0].evidence).toEqual([
      { id: "approved-1", claim: "Led a regional transformation programme." },
    ]);
  });
});
