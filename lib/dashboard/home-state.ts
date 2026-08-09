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
    return {
      primaryAction: {
        href: "/career-truth#profile-review",
        label: "Review my Career Profile",
      },
      readiness: {
        label: "Career Profile ready",
        title: "Review the career story Sartho understood.",
        description: "Check one concise profile summary, correct anything unclear and confirm it in one action.",
        href: "/career-truth#profile-review",
        action: "Review my Career Profile",
      },
      positioningFallback: "Your target role strategy is the next step after you confirm your Career Profile.",
      profileMetaFallback: "Profile ready to review",
    };
  }

  if (approvedEvidence > 0) {
    return {
      primaryAction: {
        href: "/jobs",
        label: "Open opportunities",
      },
      readiness: {
        label: "Career workspace ready",
        title: "Your Career Profile is ready.",
        description: "Your confirmed profile can now support opportunity matching, résumé tailoring and interview preparation.",
        href: "/career-truth",
        action: "Strengthen my Career Profile",
      },
      positioningFallback: "Add target profiles to turn your Career Profile into a focused search strategy.",
      profileMetaFallback: "Profile confirmed",
    };
  }

  return {
    primaryAction: {
      href: "/journey",
      label: "Build my Career Profile",
    },
    readiness: {
      label: "Career Profile needed",
      title: "Sartho does not know enough about your career yet.",
      description: "Complete Your Journey or add a stronger résumé before asking Sartho to match, tailor or prepare.",
      href: "/journey",
      action: "Open Your Journey",
    },
    positioningFallback: "Build your Career Profile before creating a target role strategy.",
    profileMetaFallback: "Private profile",
  };
}
