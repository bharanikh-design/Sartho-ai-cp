export type NavigationIconName =
  | "home"
  | "journey"
  | "truth"
  | "analyse"
  | "resume"
  | "interview"
  | "applications"
  | "shield"
  | "gauge"
  | "link"
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

/*
 * Analysing a role is its own job, not a preamble to the pipeline.
 *
 * It lived as a card at the top of Opportunities, which put a form nobody had
 * asked for above the list everybody came to read — the pipeline was below the
 * fold, so a person could visit Opportunities and never learn they had one. And
 * "paste an advert, see whether it fits your evidence" is a complete thing on
 * its own: it needs a résumé and nothing else, and it is the fastest way to
 * show somebody what Sartho does.
 */
const analyseNavigation: NavigationItem = {
  label: "Analyse a Role",
  shortLabel: "Analyse",
  href: "/analyse",
  icon: "analyse",
  purpose: "Paste any job advert and see how it reads against your approved evidence.",
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

/*
 * The browser extension is a setup task, not a destination.
 *
 * There is a real page and a real build now — /extension explains how to
 * install it and `npm run extension:zip` packages it — so the old "coming
 * soon" placeholder is gone. It still does not earn a place on the rail: you
 * install it once and then never visit the page again. The pill on
 * Opportunities links to it, and only for people who do not have it.
 */
export function getPrimaryNavigation(_activated: boolean): NavigationItem[] {
  return [
    dashboardNavigation,
    directionNavigation,
    strategyNavigation,
    applicationNavigation,
    /*
     * After Opportunities, not before it, because the mobile bar shows the
     * first four. Ordering Analyse ahead of the pipeline pushed the pipeline
     * off the bar entirely on a phone — the page people open most, gone, to
     * promote the side entrance to it.
     */
    analyseNavigation,
    resumeNavigation,
  ];
}

/*
 * Email Alerts is a setting, not a step in the flow, so it lives in the profile
 * menu rather than the rail.
 */
export const notificationsDestination = notificationsNavigation;

export const integrationsNavigation: NavigationItem = {
  label: "Integrations",
  shortLabel: "Links",
  href: "/integrations",
  icon: "link",
  purpose: "What Sartho is connected to, and how to disconnect it",
};

export const adminNavigation: NavigationItem = {
  label: "Admin",
  shortLabel: "Admin",
  href: "/admin",
  icon: "shield",
  purpose: "Who is using Sartho, and how far they get",
};

export const diagnosticsNavigation: NavigationItem = {
  label: "Diagnostics",
  shortLabel: "Checks",
  href: "/diagnostics",
  icon: "gauge",
  purpose: "What this deployment can actually reach",
};

/*
 * Settings, as a second group rather than more items in the career flow.
 *
 * Email Alerts and Integrations were in the avatar menu at the bottom of the
 * rail, two clicks and a guess away from anybody who had not already found
 * them. They are also not steps: putting them in the flow would say they were,
 * and the rail is read top to bottom as a sequence.
 *
 * A separate labelled group is what the rail is already built for — it carries
 * a "Your career" heading — so settings get their own heading underneath it.
 * They are visible without competing, which is the actual requirement.
 *
 * Administration joins them when the person is an administrator, because
 * /admin and /diagnostics are the same kind of thing: not work, but the
 * controls behind it.
 */
export function getSettingsNavigation(isAdmin: boolean): NavigationItem[] {
  const settings = [notificationsNavigation, integrationsNavigation];
  return isAdmin ? [...settings, adminNavigation, diagnosticsNavigation] : settings;
}

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
  integrationsNavigation,
  adminNavigation,
  diagnosticsNavigation,
  dashboardNavigation,
  analyseNavigation,
  applicationNavigation,
  profileNavigation,
  directionNavigation,
  strategyNavigation,
  resumeNavigation,
  notificationsNavigation,
];

export function getMobileNavigation(activated: boolean) {
  return getPrimaryNavigation(activated).slice(0, 4);
}

export function getNavigationForPath(activated: boolean, pathname: string) {
  const navigation = getPrimaryNavigation(activated);
  const current = allNavigation.find((item) => isNavigationItemActive(pathname, item.href));
  if (!current || navigation.some((item) => item.href === current.href)) return navigation;
  /*
   * A settings page is already drawn in its own group, so appending it here
   * would put Integrations in the career rail and in Settings at once — the
   * same destination twice, one of them in a list it does not belong to.
   *
   * This append exists for pages with no home in either group, like a saved
   * role, so that the rail still shows where you are.
   */
  if (getSettingsNavigation(true).some((item) => item.href === current.href)) return navigation;
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
  ["/integrations", "Integrations"],
  ["/resume-studio", "Résumé Studio"],
];

/*
 * Routes a menu item owns without living at.
 *
 * A saved role is at /jobs/[id] and belongs to Opportunities, but the /jobs
 * menu entry was removed when Opportunities took that name — so opening a role
 * lit nothing at all in the rail, and the product forgot where you were.
 */
const OWNED_PREFIXES: Record<string, string[]> = {
  "/applications": ["/jobs"],
};

function underPrefix(pathname: string, prefix: string) {
  return prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavigationItemActive(pathname: string, href: string) {
  if (underPrefix(pathname, href)) return true;
  return (OWNED_PREFIXES[href] ?? []).some((prefix) => underPrefix(pathname, prefix));
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
