export type HomeJourneyState = {
  primaryAction: {
    href: string;
    label: string;
  };
  readiness: {
    label: string;
    title: string;
    description: string;
    href: string;
    action: string;
  };
  positioningFallback: string;
  profileMetaFallback: string;
};

type HomeJourneyInput = {
  approvedEvidence: number;
  pendingEvidence: number;
};

export function getHomeJourneyState({
  approvedEvidence,
  pendingEvidence,
}: HomeJourneyInput): HomeJourneyState {
  if (pendingEvidence > 0) {
    const reviewCount = Math.min(pendingEvidence, 3);

    return {
      primaryAction: {
        href: "/career-truth",
        label: `Review ${reviewCount} evidence record${reviewCount === 1 ? "" : "s"}`,
      },
      readiness: {
        label: "Career evidence loaded",
        title: `${pendingEvidence} claim${pendingEvidence === 1 ? " is" : "s are"} ready for your review.`,
        description: approvedEvidence
          ? `${approvedEvidence} already approved. Review the strongest remaining claims before using them for matching, résumés or interview preparation.`
          : "Approve the strongest claims first. Sartho will not use any résumé claim until you confirm it is true.",
        href: "/career-truth",
        action: "Continue evidence review",
      },
      positioningFallback: "Your target role strategy is the next step after you approve the evidence that represents you best.",
      profileMetaFallback: "Evidence imported",
    };
  }

  if (approvedEvidence > 0) {
    return {
      primaryAction: {
        href: "/jobs",
        label: "Analyse a role",
      },
      readiness: {
        label: "Career workspace ready",
        title: "Your evidence base is ready.",
        description: `${approvedEvidence} approved evidence record${approvedEvidence === 1 ? " can" : "s can"} now support honest matching, résumé tailoring and interview preparation.`,
        href: "/career-truth",
        action: "Strengthen my Career Profile",
      },
      positioningFallback: "Add target role lanes to turn your approved evidence into a focused search strategy.",
      profileMetaFallback: "Evidence ready",
    };
  }

  return {
    primaryAction: {
      href: "/career-truth",
      label: "Choose usable evidence",
    },
    readiness: {
      label: "Career evidence needs attention",
      title: "Nothing is approved for use yet.",
      description: "Review your Career Profile or add a stronger résumé before asking Sartho to match, tailor or prepare.",
      href: "/career-truth",
      action: "Open Career Profile",
    },
    positioningFallback: "Approve evidence before creating a target role strategy.",
    profileMetaFallback: "Private profile",
  };
}

