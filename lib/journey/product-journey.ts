import type { ProfileRecord } from "@/lib/types";
import type { SearchPreferences } from "@/lib/data/search";

export type ProductJourneyStepId =
  | "resume"
  | "confirm"
  | "direction"
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
  const directionComplete = strengthsComplete && profilesComplete;
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
      id: "confirm",
      label: "Profile review",
      detail: evidenceConfirmed
        ? `Career Profile confirmed from ${input.roles} role${input.roles === 1 ? "" : "s"}`
        : extractionComplete
          ? "AI has organised your résumé; review what it found"
          : "Sartho will organise the résumé before your review",
      href: "/career-truth#profile-review",
      complete: evidenceConfirmed,
      title: "Confirm that the profile represents you",
      description: "Review your professional snapshot, strengths and signature achievements, then confirm the profile in one action.",
      reason: "Sartho organises the résumé; you confirm the overall career story.",
    },
    {
      id: "direction",
      label: "Career direction",
      detail: directionComplete
        ? `${input.activeLanes} priorities, strengths and mobility confirmed`
        : "Review AI suggestions, then set priorities and mobility",
      href: "/career-direction",
      complete: directionComplete,
      title: "Choose the direction that feels right",
      description: "Review AI-suggested paths grounded in your Career Profile, then choose your strengths, role priorities and mobility constraints.",
      reason: "AI can broaden the possibilities; only you can decide which paths should shape the search.",
    },
    {
      id: "search",
      label: "Search brief",
      detail: searchComplete
        ? `${input.searchPreferences.targetLocations.length} locations · ${activeSources} active sources`
        : "Choose locations, work model and trusted sources",
      href: "/search-plan",
      complete: searchComplete,
      title: "Set the brief for worthwhile opportunities",
      description: "Confirm target locations, working model and trusted sources. This saves your search criteria; it does not yet fetch roles automatically.",
      reason: "A clear brief makes every opportunity decision consistent and prepares Sartho for future source integrations.",
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
