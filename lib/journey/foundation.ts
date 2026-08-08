export type FoundationStepState = "complete" | "current" | "upcoming";

export type FoundationStep = {
  id: "resume" | "review" | "confirm";
  label: string;
  detail: string;
  state: FoundationStepState;
};

type FoundationInput = {
  completedImports: number;
  processingImports: number;
  roles: number;
  evidence: number;
  approvedEvidence: number;
  rejectedEvidence: number;
};

export type FoundationState = {
  progress: number;
  readiness: "Getting started" | "Resume received" | "Ready for confirmation" | "Foundation ready";
  currentStep: 1 | 2 | 3;
  steps: FoundationStep[];
};

/*
 * The journey is derived from durable records rather than a separate flag.
 * A user can close the browser at any point and the same state is reconstructed
 * from their private imports and evidence when they return.
 */
export function getFoundationState(input: FoundationInput): FoundationState {
  const hasResume = input.completedImports > 0 || input.processingImports > 0 || input.evidence > 0;
  const extractionComplete = input.evidence > 0;
  const reviewed = Math.min(input.evidence, input.approvedEvidence + input.rejectedEvidence);
  const confirmationComplete = extractionComplete && reviewed === input.evidence && input.approvedEvidence > 0;
  const confirmationFraction = input.evidence ? reviewed / input.evidence : 0;

  const confirmationProgress = confirmationComplete
    ? 33
    : Math.min(32, Math.round(33 * confirmationFraction));
  const progress = (hasResume ? 33 : 0)
    + (extractionComplete ? 34 : 0)
    + confirmationProgress;

  const currentStep: 1 | 2 | 3 = !hasResume ? 1 : !extractionComplete ? 2 : 3;
  const readiness = confirmationComplete
    ? "Foundation ready"
    : extractionComplete
      ? "Ready for confirmation"
      : hasResume
        ? "Resume received"
        : "Getting started";

  return {
    progress: Math.min(100, progress),
    readiness,
    currentStep,
    steps: [
      {
        id: "resume",
        label: "Resume upload",
        detail: hasResume ? `${Math.max(input.completedImports, 1)} resume received securely` : "Upload PDF, Word or text",
        state: hasResume ? "complete" : "current",
      },
      {
        id: "review",
        label: "AI resume review",
        detail: extractionComplete
          ? `${input.roles} roles and ${input.evidence} evidence records mapped`
          : input.processingImports
            ? "Sartho is reading your career evidence"
            : "Experience, skills and achievements",
        state: extractionComplete ? "complete" : hasResume ? "current" : "upcoming",
      },
      {
        id: "confirm",
        label: "Your confirmation",
        detail: confirmationComplete
          ? `${input.approvedEvidence} records approved for use`
          : extractionComplete
            ? `${input.evidence - reviewed} records still need a decision`
            : "Approve, edit or reject every claim",
        state: confirmationComplete ? "complete" : extractionComplete ? "current" : "upcoming",
      },
    ],
  };
}
