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

/**
 * The primary navigation follows the product journey: understand the overall
 * picture, build the career foundation, find and assess opportunities, then
 * manage each application through preparation and outcome.
 */
export const primaryNavigation: NavigationItem[] = [
  {
    label: "Dashboard",
    shortLabel: "Home",
    href: "/",
    icon: "home",
    purpose: "See opportunity activity, applications and the next best action.",
  },
  {
    label: "User Journey",
    shortLabel: "Journey",
    href: "/journey",
    icon: "journey",
    purpose: "Complete the career foundation Sartho needs before searching.",
  },
  {
    label: "Résumé Studio",
    shortLabel: "Résumé",
    href: "/resume-studio",
    icon: "resume",
    purpose: "Manage evidence-backed résumé versions for specific roles.",
  },
  {
    label: "Career Direction",
    shortLabel: "Direction",
    href: "/career-direction",
    icon: "truth",
    purpose: "Refine strengths, target profiles and career priorities.",
  },
  {
    label: "Search Plan",
    shortLabel: "Search",
    href: "/search-plan",
    icon: "analyse",
    purpose: "Choose target locations and trusted opportunity sources.",
  },
  {
    label: "Analyse a Role",
    shortLabel: "Analyse",
    href: "/jobs",
    icon: "analyse",
    purpose: "Screen a real opportunity against the approved career profile.",
  },
  {
    label: "Applications",
    shortLabel: "Track",
    href: "/applications",
    icon: "applications",
    purpose: "Track every saved opportunity, application stage and outcome.",
  },
  {
    label: "Interview Prep",
    shortLabel: "Prepare",
    href: "/interview-prep",
    icon: "interview",
    purpose: "Prepare role-specific questions and evidence-backed stories.",
  },
];

const supportingPageLabels: Array<[prefix: string, label: string]> = [
  ["/career-truth", "Career Profile"],
  ["/diagnostics", "Diagnostics"],
];

const mobileHrefs = new Set(["/", "/journey", "/jobs", "/applications"]);

export const mobileNavigation = primaryNavigation.filter((item) => mobileHrefs.has(item.href));

export function isNavigationItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function getPageLabel(pathname: string) {
  const primary = primaryNavigation.find((item) => isNavigationItemActive(pathname, item.href));
  if (primary) return primary.label;

  return supportingPageLabels.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? "Sartho";
}
