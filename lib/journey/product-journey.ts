import type { ProfileRecord } from "@/lib/types";
import type { SearchPreferences } from "@/lib/data/search";

export type ProductJourneyStepId =
  | "resume"
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
  // An uploaded résumé is taken as approved and final — Sartho reads it straight
  // into evidence, with no separate line-by-line confirmation step.
  const resumeReceived = input.completeImports > 0 || input.evidence > 0;
  const strengthsComplete = Boolean(input.profile?.strengths.length);
  const profilesComplete = input.activeLanes > 0 && input.activeLaneAllocation === 100;
  const directionComplete = strengthsComplete && profilesComplete;
  const activeSources = input.searchPreferences.sources.filter((source) => source.active).length;
  // Coverage is a country (anywhere in it) or at least one city. Cities alone
  // still count so a brief saved before the country model keeps working.
  const hasCoverage = Boolean(input.searchPreferences.country)
    || input.searchPreferences.targetLocations.length > 0;
  const searchComplete = hasCoverage
    && activeSources > 0
    && Boolean(input.searchPreferences.remotePreference);
  const coverageLabel = input.searchPreferences.targetLocations.length
    ? `${input.searchPreferences.targetLocations.length} locations`
    : `${input.searchPreferences.country?.toUpperCase() ?? "?"} nationwide`;

  const steps: ProductJourneyStep[] = [
    {
      id: "resume",
      label: "Master résumé",
      detail: resumeReceived ? "Source document received" : "Upload or build your starting résumé",
      href: "/career-truth#resume",
      complete: resumeReceived,
      title: "Upload your résumé",
      description: "Upload the strongest résumé you have. Sartho reads it straight into your approved career evidence — no line-by-line confirmation.",
      reason: "Every recommendation must begin with a source you control.",
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
        ? `${coverageLabel} · ${activeSources} active sources`
        : "Choose your country, locations and work model",
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
