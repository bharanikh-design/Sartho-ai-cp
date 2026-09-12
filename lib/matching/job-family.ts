import { normaliseText } from "@/lib/matching/skill-vocabulary";

/*
 * What kind of job this is — the first question a recruiter asks, and the one
 * Sartho never asked.
 *
 * The search engine applied exactly one hard filter: seniority. Everything else
 * was a soft score. So a Business Analyst six months into their career was shown
 * "Solutions Consultant" roles, because 65% of the score comes from requirement
 * coverage and evidence depth, and a pre-sales advert and a BA CV share plenty
 * of words — stakeholders, roadmap, requirements, presenting. Nothing ever
 * asked whether it was the same line of work.
 *
 * No recruiter would send that CV to that job. Not because the score was low,
 * but because it is a different function. A list of jobs somebody cannot get is
 * noise no matter how well it is ordered, and it buries the ones they can.
 *
 * So: a small table of job families, each with the titles it is written as, and
 * a map of which families are genuine neighbours. Analysis, Data and Consulting
 * are neighbours — people move between them every day. Analysis and Sales are
 * not. A role outside your families and their neighbours is dropped and counted,
 * the same way a role above your level already is.
 *
 * Like the capability vocabulary, this is a fixed readable table rather than a
 * model: free, instant, identical for everyone, and correctable by a person who
 * disagrees with it. Nothing here may encode one particular CV.
 */

export type JobFamily = {
  id: string;
  /** How a title for this family is written in the wild, lower case. */
  titles: string[];
};

/*
 * "Solutions consultant" is the case that proves this file is needed. It carries
 * the word "consultant" but it is a pre-sales job: the work is winning revenue,
 * not delivering analysis. It has to resolve to Sales and beat the generic
 * "consultant" → Consulting rule, which is why longest-surface-wins matters here
 * exactly as it does in the capability vocabulary.
 */
export const JOB_FAMILIES: JobFamily[] = [
  {
    id: "Analysis",
    titles: [
      "business analyst", "business analysis", "systems analyst", "process analyst",
      "business process analyst", "business process architect", "process architect",
      "business process lead", "business process manager",
      "requirements analyst", "functional analyst", "business systems analyst",
      "operations analyst", "insights analyst", "research analyst", "reporting analyst",
      "business intelligence analyst", "bi analyst", "analyst",
    ],
  },
  {
    id: "Data",
    titles: [
      "data analyst", "data scientist", "data engineer", "analytics engineer",
      "machine learning engineer", "ml engineer", "data architect", "analytics manager",
      "quantitative analyst", "statistician", "data specialist", "analytics consultant",
    ],
  },
  {
    id: "Consulting",
    titles: [
      "consultant", "management consultant", "strategy consultant", "technology consultant",
      "associate consultant", "engagement manager", "advisory", "advisor", "adviser",
      "principal consultant", "practice lead", "practice director", "practice manager",
      "practice head", "delivery principal", "strategist", "strategy manager",
    ],
  },
  {
    id: "Strategy",
    titles: [
      "strategy analyst", "corporate strategy", "commercial analyst", "commercial manager",
      "business strategy", "corporate development", "market analyst", "pricing analyst",
    ],
  },
  {
    id: "Product",
    titles: [
      "product manager", "product owner", "product analyst", "associate product manager",
      "technical product manager", "product lead", "product specialist",
    ],
  },
  {
    id: "Project delivery",
    titles: [
      "project manager", "programme manager", "program manager", "project coordinator",
      "delivery manager", "delivery lead", "delivery director", "delivery head",
      "scrum master", "agile coach", "pmo analyst", "pmo",
      "project analyst", "portfolio manager", "implementation manager",
      "implementation lead", "deployment manager", "rollout manager",
    ],
  },
  {
    id: "Change",
    titles: [
      "change manager", "change analyst", "change lead", "transformation manager",
      "transformation lead", "organisational change", "organizational change",
      "business readiness", "adoption lead",
    ],
  },
  {
    id: "Engineering",
    titles: [
      "software engineer", "software developer", "developer", "programmer",
      "full stack", "backend engineer", "frontend engineer", "front end developer",
      "back end developer", "mobile developer", "engineer", "solutions architect",
      "technical architect", "devops engineer", "platform engineer", "site reliability",
      "cloud engineer", "systems engineer", "qa engineer", "test engineer",
      "automation engineer", "test analyst", "quality analyst",
      /*
       * The ServiceNow build roles sit here, with the other build roles, and
       * not beside ServiceNow delivery leadership in IT operations. They are
       * the same platform and a different job, and the distinction is load
       * bearing: it is what keeps a hands-on developer advert out of a
       * delivery director's search while "ServiceNow" itself is recognised
       * everywhere else.
       */
      "servicenow developer", "servicenow engineer", "servicenow administrator",
      "servicenow technical consultant",
    ],
  },
  {
    /*
     * Service management, which is the line of work this product was built
     * around and which its own classifier could not see.
     *
     * "ServiceNow" appeared nowhere in this file. A person whose target roles
     * read "ServiceNow Business Process Architect" and "ServiceNow Delivery
     * Director" had both classified as nothing at all, so neither contributed
     * to their reach — and "IT Service Delivery Manager", the most obvious
     * adjacent role they could be shown, came back hidden as "a different line
     * of work". The search was refusing to show a ServiceNow professional
     * ServiceNow jobs.
     *
     * The platform names are here deliberately. A title is what it says in the
     * wild, and in this market it says ServiceNow, ITSM and service management
     * far more often than it says "it operations".
     */
    id: "IT operations",
    titles: [
      "service desk", "help desk", "helpdesk", "it support", "desktop support",
      "system administrator", "systems administrator", "network engineer",
      "infrastructure engineer", "it operations", "service delivery manager",
      "service delivery lead", "service delivery director", "service delivery head",
      "incident manager", "problem manager", "it analyst",
      "servicenow", "service now", "servicenow consultant",
      "servicenow architect", "servicenow platform owner",
      "servicenow delivery director", "servicenow delivery lead",
      "servicenow delivery manager", "servicenow process owner",
      "itsm", "itsm lead", "itsm manager", "itsm consultant", "itsm architect",
      "it service management", "service management", "service management lead",
      "service management manager", "service manager", "service owner",
      "itil", "itom", "itbm", "cmdb", "configuration manager",
      "major incident manager", "change enablement", "release manager",
      "platform owner", "platform manager",
    ],
  },
  {
    id: "Security",
    titles: [
      "security analyst", "cyber security analyst", "cybersecurity analyst",
      "information security", "security engineer", "security consultant",
      "penetration tester", "soc analyst", "grc analyst", "risk and compliance",
      "security architect",
    ],
  },
  {
    id: "Risk",
    titles: [
      "risk analyst", "risk manager", "compliance analyst", "compliance manager",
      "internal audit", "auditor", "audit manager", "governance analyst",
      "controls analyst", "assurance analyst", "regulatory analyst",
    ],
  },
  {
    id: "Finance",
    titles: [
      "financial analyst", "finance analyst", "accountant", "management accountant",
      "financial controller", "finance manager", "fp a", "treasury analyst",
      "credit analyst", "investment analyst", "bookkeeper", "payroll",
    ],
  },
  {
    /*
     * Pre-sales lives here, not in Consulting. "Solutions consultant", "sales
     * engineer" and "pre sales consultant" are revenue roles whatever the title
     * says, and this is the single most common way a technical CV gets pulled
     * into a sales pipeline it never asked for.
     */
    id: "Sales",
    titles: [
      "membership consultant", "solutions consultant", "solution consultant", "sales engineer", "pre sales",
      "presales", "pre sales consultant", "solutions engineer", "solution architect sales",
      "sales manager", "sales representative", "sales executive", "account executive",
      "account manager", "business development manager", "business development representative",
      "bdm", "bdr", "sdr", "sales development", "client partner", "key account",
      "territory manager", "sales consultant", "inside sales", "sales associate",
      "retail assistant", "store manager", "sales assistant",
    ],
  },
  {
    id: "Marketing",
    titles: [
      "marketing manager", "marketing analyst", "marketing coordinator", "brand manager",
      "digital marketing", "content marketing", "seo specialist", "campaign manager",
      "growth marketer", "communications manager", "social media manager", "copywriter",
      "public relations",
    ],
  },
  {
    id: "Customer success",
    titles: [
      "customer success manager", "customer success", "account coordinator",
      "customer service", "customer support", "client services", "customer experience",
      "call centre", "call center", "contact centre", "service consultant",
      "relationship manager",
    ],
  },
  {
    id: "Operations",
    titles: [
      "operations manager", "operations coordinator", "supply chain analyst",
      "supply chain manager", "logistics coordinator", "logistics manager",
      "procurement analyst", "procurement manager", "buyer", "planner",
      "demand planner", "inventory analyst", "merchandiser", "category manager",
      "warehouse manager", "continuous improvement", "process improvement",
    ],
  },
  {
    id: "People",
    titles: [
      "human resources", "hr manager", "hr advisor", "hr business partner",
      "people and culture", "talent acquisition", "recruiter", "recruitment consultant",
      "learning and development", "training manager", "people operations",
    ],
  },
  {
    id: "Design",
    titles: [
      "ux designer", "ui designer", "product designer", "user experience designer",
      "graphic designer", "visual designer", "interaction designer", "ux researcher",
      "service designer", "creative director",
    ],
  },
  {
    id: "Healthcare",
    titles: [
      "nurse", "registered nurse", "clinician", "clinical", "care worker",
      "support worker", "aged care", "disability support", "allied health",
      "physiotherapist", "pharmacist", "medical officer",
    ],
  },
  {
    id: "Education",
    titles: [
      "teacher", "lecturer", "tutor", "academic", "education coordinator",
      "student advisor", "student support", "curriculum", "instructional designer",
    ],
  },
  {
    id: "Legal",
    titles: [
      "lawyer", "solicitor", "paralegal", "legal counsel", "contracts manager",
      "contract administrator", "legal advisor", "compliance officer",
    ],
  },
];

/*
 * Which families are genuine neighbours, as undirected edges.
 *
 * This started as an `adjacent` list on each family and it was wrong twenty
 * times over: Analysis named Data, Data never named Analysis back. A one-way
 * edge filters one person's results and not the other's for no defensible
 * reason, so the relationship is stored once, as a pair, and symmetry stops
 * being something a test has to police.
 */
export const FAMILY_EDGES: Array<[string, string]> = [
  ["Analysis", "Data"],
  ["Analysis", "Consulting"],
  ["Analysis", "Product"],
  ["Analysis", "Project delivery"],
  ["Analysis", "Risk"],
  ["Analysis", "Finance"],
  ["Analysis", "Operations"],
  ["Data", "Engineering"],
  ["Data", "Consulting"],
  ["Data", "Product"],
  ["Consulting", "Strategy"],
  ["Consulting", "Project delivery"],
  ["Consulting", "Change"],
  ["Strategy", "Finance"],
  ["Strategy", "Sales"],
  ["Product", "Design"],
  ["Product", "Engineering"],
  ["Product", "Marketing"],
  ["Project delivery", "Change"],
  ["Project delivery", "IT operations"],
  ["Project delivery", "Operations"],
  ["Change", "People"],
  ["Engineering", "IT operations"],
  ["Engineering", "Security"],
  ["Engineering", "Design"],
  ["IT operations", "Security"],
  ["Security", "Risk"],
  ["Risk", "Finance"],
  ["Risk", "Legal"],
  ["Finance", "Legal"],
  ["Sales", "Marketing"],
  ["Sales", "Customer success"],
  ["Marketing", "Design"],
  ["Customer success", "Operations"],
  ["Customer success", "People"],
  ["Operations", "People"],
  ["People", "Education"],
  ["Healthcare", "Education"],
];

/* Longest title first, so "solutions consultant" beats "consultant". */
const TITLE_INDEX: Array<{ title: string; family: string }> = JOB_FAMILIES
  .flatMap((family) => family.titles.map((title) => ({ title, family: family.id })))
  .sort((a, b) => b.title.length - a.title.length);

const ADJACENCY = new Map<string, string[]>(JOB_FAMILIES.map((family) => [family.id, []]));
for (const [left, right] of FAMILY_EDGES) {
  ADJACENCY.get(left)?.push(right);
  ADJACENCY.get(right)?.push(left);
}

/** Families a person in this one credibly moves into. */
export function adjacentFamilies(family: string): string[] {
  return ADJACENCY.get(family) ?? [];
}

/**
 * The family a single job title belongs to, or null when the title is not one
 * this table knows. Null is not "no match" — it is "no opinion", and the caller
 * must not use it to reject something.
 */
/*
 * Adverts pluralise titles — "Club Managers | Membership Consultants",
 * "Business Analysts (x3)". Matching only the singular meant every one of those
 * resolved to no family at all, and the abstention rule then let them straight
 * through the filter. A trailing "s" is checked alongside the canonical form.
 */
function containsTitle(haystack: string, title: string): boolean {
  return haystack.includes(` ${title} `) || haystack.includes(` ${title}s `);
}

export function familyOfTitle(title: string): string | null {
  const haystack = normaliseText(title);
  for (const entry of TITLE_INDEX) {
    if (containsTitle(haystack, entry.title)) return entry.family;
  }
  return null;
}

/**
 * The market-recognised title inside a longer string, or null.
 *
 * Career Direction produces composites — "Risk Cybersecurity Analyst",
 * "Strategy Operations Analyst" — which read fine to a person and match nothing
 * on a job board, because no employer posts that title. This pulls the real
 * title back out so the search asks for something that exists.
 */
export function marketTitleIn(title: string): string | null {
  const haystack = normaliseText(title);
  for (const entry of TITLE_INDEX) {
    if (containsTitle(haystack, entry.title)) {
      /* Title case, because this is shown back as "roles searched". */
      return entry.title.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }
  }
  return null;
}

/** Every family represented across a person's held and targeted titles. */
export function familiesOf(titles: string[]): Set<string> {
  const found = new Set<string>();
  for (const title of titles) {
    const family = familyOfTitle(title);
    if (family) found.add(family);
  }
  return found;
}

/** A family plus everything a person in it credibly moves into. */
export function reachableFamilies(families: Iterable<string>): Set<string> {
  const reach = new Set<string>();
  for (const family of families) {
    reach.add(family);
    for (const neighbour of ADJACENCY.get(family) ?? []) reach.add(neighbour);
  }
  return reach;
}

export type FamilyFit = {
  /** The job's family, or null when the table has no opinion about the title. */
  jobFamily: string | null;
  /** Families the person works in, from held and targeted titles. */
  candidateFamilies: string[];
  /** True when this is the same line of work, or a credible neighbour of it. */
  withinReach: boolean;
  /** Why it was dropped, for showing rather than filtering silently. */
  reason: string | null;
};

/**
 * Whether a job is the same line of work as this person's, or a neighbour.
 *
 * Two deliberate abstentions, both of which keep the role rather than drop it:
 * a title the table does not recognise, and a person whose own titles it does
 * not recognise. A filter that rejects on ignorance is worse than no filter,
 * because the person cannot tell the difference between "nothing matched" and
 * "we threw yours away".
 */
/**
 * The families a person's results should be drawn from.
 *
 * Target roles govern when the person has set any. Held titles only fill in
 * when they have not.
 *
 * Pooling the two was wrong in a way a real search made obvious: one casual
 * shop job in somebody's history put "retail assistant" in the Sales family,
 * which opened Sales and every neighbour of it — Marketing, Customer success,
 * Strategy — and a gym's membership-sales advert came back as a match for an
 * analyst. What a person is aiming at is a deliberate statement; a job they
 * held years ago is not a request to be shown more like it.
 */
export function reachFrom(heldTitles: string[], targetTitles: string[]): string[] {
  const targeted = familiesOf(targetTitles);
  return [...(targeted.size ? targeted : familiesOf(heldTitles))];
}

/**
 * The titles this table has no opinion about.
 *
 * Worth asking, because a target role that classifies as nothing contributes
 * nothing to the reach — silently. Somebody aiming at "ServiceNow Business
 * Process Architect" and "ServiceNow Delivery Director" had both fall through
 * and never learned that their search had been narrowed to the three roles the
 * table happened to recognise.
 */
export function unclassifiedTitles(titles: string[]): string[] {
  return titles.map((title) => title.trim()).filter((title) => title && !familyOfTitle(title));
}

export function familyFit(jobTitle: string, heldTitles: string[], targetTitles: string[] = []): FamilyFit {
  const jobFamily = familyOfTitle(jobTitle);
  const candidateFamilies = reachFrom(heldTitles, targetTitles);

  if (!jobFamily || !candidateFamilies.length) {
    return { jobFamily, candidateFamilies, withinReach: true, reason: null };
  }

  /*
   * A reach built from only some of somebody's target roles is not a reach, it
   * is a guess — and hiding on a guess is what produced the failure this whole
   * change exists for. So when any target role fell through the table, the
   * filter stands down and nothing is hidden on family alone.
   *
   * This is not a workaround for a thin vocabulary. However many titles are
   * added, somebody's specialism will eventually not be among them, and the
   * right behaviour then is to show them the roles and say the picture is
   * incomplete — never to quietly decide they work somewhere else. Showing one
   * irrelevant advert costs a glance; hiding the job they wanted costs the job.
   */
  if (targetTitles.length && unclassifiedTitles(targetTitles).length) {
    return { jobFamily, candidateFamilies, withinReach: true, reason: null };
  }

  const reach = reachableFamilies(candidateFamilies);
  if (reach.has(jobFamily)) {
    return { jobFamily, candidateFamilies, withinReach: true, reason: null };
  }

  return {
    jobFamily,
    candidateFamilies,
    withinReach: false,
    reason: `${jobFamily} is a different line of work from ${candidateFamilies.join(", ")}.`,
  };
}
