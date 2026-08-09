import type { ProfileRecord } from "@/lib/types";
import type { SearchPreferences } from "@/lib/data/search";

export type ProductJourneyStepId =
  | "resume"
  | "extract"
  | "confirm"
  | "context"
  | "strengths"
  | "profiles"
  | "search";

export type ProductJourneyStep = {
  id: ProductJourneyStepId;
  label: string;
  detail: string;
  href: string;
  complete: boolean;
  title: string;
  description: string;
  reason: string;
};

export type ProductJourneyInput = {
  profile: ProfileRecord | null;
  completeImports: number;
  roles: number;
  evidence: number;
  approvedEvidence: number;
  pendingEvidence: number;
  activeLanes: number;
  activeLaneAllocation: number;
  searchPreferences: SearchPreferences;
};

export type ProductJourneyState = {
  activated: boolean;
  progress: number;
  completedSteps: number;
  currentIndex: number;
  current: ProductJourneyStep;
  steps: ProductJourneyStep[];
};

/**
 * One durable definition of readiness for the Journey, Dashboard and shell.
 * No page may invent its own completion percentage or activation rule.
 */
export function buildProductJourney(input: ProductJourneyInput): ProductJourneyState {
  const resumeReceived = input.completeImports > 0 || input.evidence > 0;
  const extractionComplete = input.evidence > 0;
  const evidenceConfirmed = extractionComplete
    && input.approvedEvidence > 0
    && input.pendingEvidence === 0;
  const contextComplete = Boolean(
    input.profile?.headline?.trim()
      && input.profile.location?.trim()
      && input.profile.work_authorisation?.trim(),
  );
  const strengthsComplete = Boolean(input.profile?.strengths.length);
  const profilesComplete = input.activeLanes > 0 && input.activeLaneAllocation === 100;
  const activeSources = input.searchPreferences.sources.filter((source) => source.active).length;
  const searchComplete = input.searchPreferences.targetLocations.length > 0
    && activeSources > 0
    && Boolean(input.searchPreferences.remotePreference);

  const steps: ProductJourneyStep[] = [
    {
      id: "resume",
      label: "Master résumé",
      detail: resumeReceived ? "Source document received" : "Upload or build your starting résumé",
      href: "/career-truth#resume",
      complete: resumeReceived,
      title: "Bring in your career story",
      description: "Upload the strongest résumé you have. If it is incomplete, Sartho can still help you strengthen the evidence after import.",
      reason: "Every recommendation must begin with a source you control.",
    },
    {
      id: "extract",
      label: "AI extraction",
      detail: extractionComplete ? `${input.roles} roles and ${input.evidence} evidence records mapped` : "Map roles, skills and achievements",
      href: "/career-truth#career-history",
      complete: extractionComplete,
      title: "Let Sartho structure what it found",
      description: "Sartho separates roles, achievements, skills and certifications so each statement can be checked independently.",
      reason: "Structured evidence makes matching explainable instead of keyword-driven.",
    },
    {
      id: "confirm",
      label: "Evidence confirmation",
      detail: evidenceConfirmed ? `${input.approvedEvidence} records approved` : `${input.pendingEvidence} decisions remain`,
      href: "/career-truth#evidence-review",
      complete: evidenceConfirmed,
      title: "Approve what Sartho may use",
      description: "Confirm accurate evidence and reject anything misleading before it supports a match, résumé or interview answer.",
      reason: "AI proposes. You remain the authority on your career.",
    },
    {
      id: "context",
      label: "Career context",
      detail: contextComplete ? "Goal, location and mobility confirmed" : "Goal, location and work rights",
      href: "/career-direction#context",
      complete: contextComplete,
      title: "Define what a successful next move means",
      description: "Confirm the work you want, where you are based and where you can realistically work.",
      reason: "The same experience can support very different futures; context makes the search personal.",
    },
    {
      id: "strengths",
      label: "Career strengths",
      detail: strengthsComplete ? `${input.profile?.strengths.length ?? 0} strengths selected` : "Choose the signals you want to lead with",
      href: "/career-direction#strengths",
      complete: strengthsComplete,
      title: "Choose the strengths that should lead",
      description: "Keep, edit or remove the evidence-backed strengths that should shape role recommendations.",
      reason: "Your strongest signals should influence ranking without hard-coding your future.",
    },
    {
      id: "profiles",
      label: "Target profiles",
      detail: profilesComplete ? `${input.activeLanes} profiles weighted to 100%` : "Rank the roles Sartho should pursue",
      href: "/career-direction#priorities",
      complete: profilesComplete,
      title: "Set your role search order",
      description: "Add, rank and weight the profiles Sartho should prioritise, including pivots and adjacent possibilities.",
      reason: "Priority weights turn broad career possibilities into an intentional search strategy.",
    },
    {
      id: "search",
      label: "Search strategy",
      detail: searchComplete
        ? `${input.searchPreferences.targetLocations.length} locations · ${activeSources} active sources`
        : "Choose locations, work model and trusted sources",
      href: "/search-plan",
      complete: searchComplete,
      title: "Choose where opportunities should come from",
      description: "Confirm target locations, working model and the trusted sources that should define your opportunity coverage.",
      reason: "A search is only useful when its geography, sources and constraints are explicit.",
    },
  ];

  const completedSteps = steps.filter((step) => step.complete).length;
  const activated = completedSteps === steps.length;
  const firstIncomplete = steps.findIndex((step) => !step.complete);
  const currentIndex = firstIncomplete === -1 ? steps.length - 1 : firstIncomplete;

  return {
    activated,
    progress: Math.round((completedSteps / steps.length) * 100),
    completedSteps,
    currentIndex,
    current: steps[currentIndex],
    steps,
  };
}
