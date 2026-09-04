export type NavigationIconName =
  | "home"
  | "journey"
  | "truth"
  | "analyse"
  | "resume"
  | "interview"
  | "applications"
  | "shield";

export type NavigationItem = {
  label: string;
  shortLabel: string;
  href: string;
  icon: NavigationIconName;
  purpose: string;
};

const journeyNavigation: NavigationItem = {
  label: "Your Journey",
  shortLabel: "Journey",
  href: "/journey",
  icon: "journey",
  purpose: "Complete the career foundation Sartho needs before searching.",
};

const dashboardNavigation: NavigationItem = {
  label: "Dashboard",
  shortLabel: "Dashboard",
  href: "/",
  icon: "home",
  purpose: "See opportunity activity, applications and the next best action.",
};

const opportunityNavigation: NavigationItem = {
  label: "Opportunities",
  shortLabel: "Explore",
  href: "/jobs",
  icon: "analyse",
  purpose: "Review saved opportunities or add a role for Career Profile matching.",
};

const applicationNavigation: NavigationItem = {
  label: "Applications",
  shortLabel: "Track",
  href: "/applications",
  icon: "applications",
  purpose: "Track every application stage, preparation task and outcome.",
};

const profileNavigation: NavigationItem = {
  label: "Upload Résumé",
  shortLabel: "Résumé",
  href: "/career-truth",
  icon: "truth",
  purpose: "Add your source résumé — Sartho reads it straight into your approved career evidence.",
};

const strategyNavigation: NavigationItem = {
  label: "Search Brief",
  shortLabel: "Brief",
  href: "/search-plan",
  icon: "resume",
  purpose: "Save the locations, work model and sources that define a worthwhile opportunity.",
};

const directionNavigation: NavigationItem = {
  label: "Career Direction",
  shortLabel: "Direction",
  href: "/career-direction",
  icon: "interview",
  purpose: "Select target roles and set your career positioning.",
};

const resumeNavigation: NavigationItem = {
  label: "Résumé Studio",
  shortLabel: "Resumes",
  href: "/resume-studio",
  icon: "resume",
  purpose: "Manage your source resumes and create tailored drafts.",
};

/**
 * Dashboard remains the orientation point throughout setup. Opportunities is
 * reachable from the start — a half-finished foundation should nudge, not wall,
 * and the page itself explains what it still needs. After activation the
 * navigation expands into the full recurring loop, adding Applications.
 */
/**
 * One flat menu, in process order, the same before and after activation:
 * Dashboard, then the five steps of the flow it orients — Upload Résumé →
 * Career Direction → Search Brief → Applications → Résumé Studio. Job analysis
 * now lives inside Applications, so there is no separate Opportunities tab, and
 * the standalone Journey page is retired in favour of the Dashboard.
 */
export function getPrimaryNavigation(_activated: boolean): NavigationItem[] {
  return [
    dashboardNavigation,
    profileNavigation,
    directionNavigation,
    strategyNavigation,
    applicationNavigation,
    resumeNavigation,
  ];
}

export const allNavigation: NavigationItem[] = [
  journeyNavigation,
  dashboardNavigation,
  opportunityNavigation,
  applicationNavigation,
  profileNavigation,
  directionNavigation,
  strategyNavigation,
  resumeNavigation,
];

export function getMobileNavigation(activated: boolean) {
  return getPrimaryNavigation(activated).slice(0, 4);
}

export function getNavigationForPath(activated: boolean, pathname: string) {
  const navigation = getPrimaryNavigation(activated);
  const current = allNavigation.find((item) => isNavigationItemActive(pathname, item.href));
  if (!current || navigation.some((item) => item.href === current.href)) return navigation;
  return [...navigation, current];
}

/* Legacy and contextual workspaces remain addressable from their parent flow. */
const supportingPageLabels: Array<[prefix: string, label: string]> = [
  ["/interview-prep", "Interview Preparation"],
  ["/diagnostics", "Diagnostics"],
  ["/resume-studio", "Résumé Studio"],
];

export function isNavigationItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function getPageLabel(pathname: string) {
  const primary = allNavigation.find((item) => isNavigationItemActive(pathname, item.href));
  if (primary) return primary.label;

  return supportingPageLabels.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? "Sartho";
}

/*
 * Kept as a named export for tests and non-shell consumers that need the full
 * product map rather than the lifecycle-specific menu.
 */
export const primaryNavigation = allNavigation;
