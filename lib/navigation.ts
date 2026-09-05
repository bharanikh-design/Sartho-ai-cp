export type NavigationIconName =
  | "home"
  | "journey"
  | "truth"
  | "analyse"
  | "resume"
  | "interview"
  | "applications"
  | "shield"
  | "bell";

export type NavigationItem = {
  label: string;
  shortLabel: string;
  href: string;
  icon: NavigationIconName;
  purpose: string;
  /** Why this is unavailable, when it is. Shown rather than silently disabled. */
  lockedReason?: string;
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

/*
 * Named "Opportunities", not "Applications", because that is what it holds:
 * every saved role from the moment you keep it, through analysis, to the
 * outcome. Calling it Applications hid the roles you had not applied for yet,
 * and left "how do I get to my opportunities?" with no answer on screen.
 */
const applicationNavigation: NavigationItem = {
  label: "Opportunities",
  shortLabel: "Roles",
  href: "/applications",
  icon: "applications",
  purpose: "Every saved role: analyse it, track the stage, record the outcome.",
};

const profileNavigation: NavigationItem = {
  label: "Upload Résumé",
  shortLabel: "Résumé",
  href: "/career-truth",
  icon: "truth",
  purpose: "Add your source résumé — Sartho reads it straight into your approved career evidence.",
};

/*
 * "Search Brief" described the form, not the outcome. This is the page that
 * goes and finds live roles, so it is named for that.
 */
const strategyNavigation: NavigationItem = {
  label: "Find Roles",
  shortLabel: "Find",
  href: "/search-plan",
  icon: "resume",
  purpose: "Set where and how you want to work, then search live listings against your evidence.",
};

const directionNavigation: NavigationItem = {
  label: "Career Direction",
  shortLabel: "Direction",
  href: "/career-direction",
  icon: "interview",
  purpose: "Select target roles and set your career positioning.",
};

const notificationsNavigation: NavigationItem = {
  label: "Email Alerts",
  shortLabel: "Alerts",
  href: "/notifications",
  icon: "bell",
  purpose: "Choose what Sartho emails you: daily new matches and the pipeline summary.",
};

const resumeNavigation: NavigationItem = {
  label: "Résumé Studio",
  shortLabel: "Resumes",
  href: "/resume-studio",
  icon: "resume",
  purpose: "Write a tailored résumé draft and check how it reads to an applicant tracking system.",
};

const extensionNavigation: NavigationItem = {
  label: "Browser Extension",
  shortLabel: "Extension",
  href: "/extension",
  icon: "applications",
  purpose: "Download and install the Sartho extension for Chrome, Safari, or Edge.",
};

export function getPrimaryNavigation(_activated: boolean): NavigationItem[] {
  return [
    dashboardNavigation,
    directionNavigation,
    strategyNavigation,
    applicationNavigation,
    resumeNavigation,
    extensionNavigation,
  ];
}

/*
 * Email Alerts is a setting, not a step in the flow, so it lives in the profile
 * menu rather than the rail.
 */
export const notificationsDestination = notificationsNavigation;

/*
 * Everything Sartho does is grounded in approved evidence, so with no résumé
 * uploaded every other page is an empty room. They stay visible — a menu that
 * vanishes reads as a broken app — but locked, each saying why.
 *
 * Upload itself is no longer a menu item: it is the Dashboard until it is done.
 */
export function getNavigationWithGate(activated: boolean, hasResume: boolean): NavigationItem[] {
  const navigation = getPrimaryNavigation(activated);
  if (hasResume) return navigation;
  return navigation.map((item) =>
    item.href === "/"
      ? item
      : { ...item, lockedReason: "Upload your résumé first" },
  );
}

export const allNavigation: NavigationItem[] = [
  journeyNavigation,
  dashboardNavigation,
  applicationNavigation,
  profileNavigation,
  directionNavigation,
  strategyNavigation,
  resumeNavigation,
  notificationsNavigation,
  extensionNavigation,
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

/*
 * Legacy and contextual workspaces remain addressable from their parent flow.
 * /jobs redirects into /applications and a saved role lives at /jobs/[id]; both
 * belong to Opportunities, so they are labelled as it without being a second
 * menu entry with the same name.
 */
const supportingPageLabels: Array<[prefix: string, label: string]> = [
  ["/jobs", "Opportunities"],
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
