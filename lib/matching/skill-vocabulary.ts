/*
 * A shared vocabulary of professional capability.
 *
 * The matcher used to compare a person's category tags ("Consulting", "Retail")
 * against the literal words of a job advert. A Business Analyst reading a
 * Business Analyst posting scored zero, because that advert says "requirements",
 * "BRD", "RTM" and "backlog" — and never the word "Consulting".
 *
 * This file is the missing middle: a small set of canonical capabilities, each
 * with the surface forms it is written as in the wild. Both sides of the
 * comparison are resolved through it, so a claim that says "gathered business
 * requirements" and an advert that says "elicit BRD" meet at the same concept.
 *
 * It is deliberately a fixed, readable table rather than a model. It costs
 * nothing, returns instantly, is identical for every user, and can be corrected
 * by a person who disagrees with it. Nothing here is about one career: adding a
 * capability must never encode a particular CV.
 */

export type Capability = {
  /** The name shown to a person. */
  id: string;
  /** Every way this appears in a résumé or an advert, lower case. */
  surfaces: string[];
};

export const CAPABILITIES: Capability[] = [
  // Analysis and delivery
  { id: "Business analysis", surfaces: ["business analysis", "business analyst", "ba", "business requirements", "requirements gathering", "requirements elicitation", "requirements analysis", "brd", "business requirements document", "frd", "functional requirements", "user stories", "use cases", "rtm", "requirements traceability", "traceability matrix", "as is", "to be", "gap analysis", "process mapping", "business process", "bpmn", "workflow design", "acceptance criteria"] },
  { id: "Data analysis", surfaces: ["data analysis", "data analyst", "data analytics", "analytics", "dataset", "datasets", "reporting", "dashboards", "dashboarding", "business intelligence", "bi", "power bi", "tableau", "looker", "qlik", "sql", "excel", "pivot table", "data visualisation", "data visualization", "metrics", "kpi", "kpis", "insights", "statistical analysis", "forecasting", "trend analysis"] },
  { id: "Project delivery", surfaces: ["project management", "project manager", "project delivery", "programme management", "program management", "pmo", "delivery management", "milestones", "project plan", "gantt", "raid", "risk register", "dependencies", "prince2", "pmp", "waterfall", "sdlc"] },
  { id: "Agile delivery", surfaces: ["agile", "scrum", "scrum master", "kanban", "sprint", "sprints", "sprint planning", "backlog", "backlog grooming", "backlog refinement", "stand up", "standup", "retrospective", "story points", "velocity", "safe", "jira", "confluence", "mvp", "iterative delivery"] },
  { id: "Product management", surfaces: ["product management", "product manager", "product owner", "roadmap", "product roadmap", "product strategy", "product lifecycle", "feature prioritisation", "feature prioritization", "discovery", "product discovery", "go to market", "user research", "customer research", "a b testing", "product analytics"] },
  { id: "Change management", surfaces: ["change management", "organisational change", "organizational change", "change adoption", "adoption", "stakeholder readiness", "training delivery", "communications plan", "prosci", "adkar", "transformation", "business transformation", "operating model", "target operating model"] },
  { id: "Stakeholder management", surfaces: ["stakeholder management", "stakeholder engagement", "stakeholders", "stakeholder alignment", "relationship management", "client engagement", "client management", "workshop facilitation", "facilitation", "workshops", "presenting to executives", "executive reporting", "steering committee", "influencing"] },
  { id: "Consulting", surfaces: ["consulting", "consultant", "advisory", "client delivery", "engagement management", "engagement manager", "case competition", "recommendations", "strategic recommendations", "management consulting", "professional services"] },
  { id: "Strategy", surfaces: ["strategy", "strategic planning", "strategic analysis", "market analysis", "competitive analysis", "business case", "business casing", "feasibility", "benefits realisation", "benefits realization", "commercial strategy", "growth strategy", "corporate strategy"] },

  // Technology
  { id: "Software engineering", surfaces: ["software engineering", "software development", "developer", "engineer", "programming", "coding", "javascript", "typescript", "python", "java", "c sharp", "dot net", ".net", "react", "node", "api", "apis", "rest", "microservices", "git", "ci cd", "unit testing", "code review"] },
  { id: "Cloud & infrastructure", surfaces: ["cloud", "aws", "azure", "gcp", "google cloud", "infrastructure", "devops", "kubernetes", "docker", "terraform", "serverless", "networking", "system administration", "migration", "cloud migration"] },
  { id: "Cybersecurity", surfaces: ["cyber security", "cybersecurity", "information security", "infosec", "security", "vulnerability", "vulnerability management", "penetration testing", "threat", "threat modelling", "soc", "siem", "iso 27001", "nist", "essential eight", "security controls", "incident response"] },
  { id: "IT governance & risk", surfaces: ["governance", "it governance", "risk", "risk management", "risk assessment", "compliance", "regulatory", "audit", "internal audit", "controls", "control testing", "policy", "policies", "framework", "grc", "operational risk", "assurance", "remediation"] },
  { id: "Data engineering", surfaces: ["data engineering", "etl", "elt", "data pipeline", "pipelines", "data warehouse", "data warehousing", "snowflake", "databricks", "spark", "airflow", "data modelling", "data modeling", "data quality", "master data"] },
  { id: "Testing & QA", surfaces: ["testing", "qa", "quality assurance", "test cases", "test plan", "uat", "user acceptance testing", "regression testing", "test automation", "defect management", "system testing", "sit"] },
  { id: "Service management", surfaces: ["service management", "itsm", "itil", "service desk", "incident management", "problem management", "change control", "servicenow", "sla", "slas", "ticketing", "end user computing", "endpoint", "asset management", "software asset management", "sam", "licensing"] },
  { id: "Enterprise systems", surfaces: ["erp", "sap", "oracle", "salesforce", "crm", "workday", "dynamics", "peoplesoft", "netsuite", "system implementation", "configuration", "integration"] },
  { id: "Automation & AI", surfaces: ["automation", "rpa", "robotic process automation", "workflow automation", "machine learning", "artificial intelligence", "ai", "llm", "generative ai", "decision logic", "rules engine", "automated tools", "scripting"] },

  // Commercial and operations
  { id: "Operations", surfaces: ["operations", "operational", "process improvement", "continuous improvement", "lean", "six sigma", "efficiency", "optimisation", "optimization", "supply chain", "logistics", "inventory", "inventory management", "stock", "warehouse", "procurement", "vendor management", "supplier management"] },
  { id: "Retail & merchandising", surfaces: ["retail", "merchandising", "merchandiser", "store operations", "markdown", "pricing", "pricing strategy", "category management", "planogram", "visual merchandising", "stock clearance", "point of sale", "pos", "shrinkage"] },
  { id: "Finance", surfaces: ["finance", "financial analysis", "financial modelling", "financial modeling", "budgeting", "p l", "profit and loss", "cost management", "variance analysis", "accounting", "reconciliation", "invoicing", "accounts payable", "accounts receivable", "cfa", "cpa"] },
  { id: "Sales & business development", surfaces: ["sales", "business development", "account management", "pipeline management", "lead generation", "negotiation", "bids", "tenders", "proposals", "rfp", "quota", "revenue growth", "upselling"] },
  { id: "Marketing", surfaces: ["marketing", "digital marketing", "campaign", "campaigns", "brand", "branding", "seo", "sem", "social media", "content marketing", "email marketing", "market research", "segmentation", "customer acquisition"] },
  { id: "Customer service", surfaces: ["customer service", "customer support", "customer experience", "cx", "help desk", "helpdesk", "front line", "frontline", "client service", "complaints", "customer satisfaction", "csat", "nps", "service quality", "call centre", "call center"] },

  // People and craft
  { id: "Leadership", surfaces: ["leadership", "team leadership", "line management", "people management", "managing a team", "mentoring", "mentorship", "coaching", "performance management", "recruitment", "hiring", "onboarding", "team building", "direct reports"] },
  { id: "Communication", surfaces: ["communication", "written communication", "verbal communication", "presentation", "presentations", "documentation", "technical writing", "storytelling", "public speaking"] },
  { id: "Training & education", surfaces: ["training", "teaching", "education", "curriculum", "learning and development", "l d", "tutoring", "instructional design", "capability building", "upskilling", "orientation"] },
  { id: "Student & community support", surfaces: ["student support", "student experience", "student services", "pastoral care", "community engagement", "volunteering", "volunteer", "peer support", "welfare", "international students", "orientation events"] },
  { id: "Healthcare", surfaces: ["healthcare", "clinical", "patient", "patient care", "nursing", "medical", "allied health", "aged care", "disability support", "ndis"] },
  { id: "Legal & contracts", surfaces: ["legal", "contracts", "contract management", "commercial contracts", "negotiating contracts", "terms and conditions", "privacy", "gdpr", "intellectual property", "litigation"] },
  { id: "Design & UX", surfaces: ["design", "user experience", "ux", "ui", "user interface", "wireframes", "prototyping", "figma", "usability", "user testing", "design system", "accessibility", "wcag"] },
];

/* Longest surface first, so "business requirements document" wins over "requirements". */
const SURFACE_INDEX: Array<{ surface: string; capability: string }> = CAPABILITIES
  .flatMap((capability) => capability.surfaces.map((surface) => ({ surface, capability: capability.id })))
  .sort((a, b) => b.surface.length - a.surface.length);

export function normaliseText(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * Every capability named anywhere in the text, whether it is a résumé claim or
 * a job advert. Whole-term matching only: "ai" must not fire inside "detail".
 */
export function capabilitiesIn(text: string): Set<string> {
  const haystack = normaliseText(text);
  const found = new Set<string>();
  for (const { surface, capability } of SURFACE_INDEX) {
    if (found.has(capability)) continue;
    if (haystack.includes(` ${surface} `)) found.add(capability);
  }
  return found;
}

/**
 * The capability a free-text label maps to — used to fold a résumé's own domain
 * tags ("Consulting", "Retail") into the same vocabulary as everything else.
 * Falls back to the label itself so an unrecognised skill is kept, not dropped.
 */
export function capabilityForLabel(label: string): string {
  const term = normaliseText(label).trim();
  if (!term) return label.trim();
  for (const { surface, capability } of SURFACE_INDEX) {
    if (surface === term) return capability;
  }
  // A multi-word tag may still contain a known capability ("retail operations").
  const inside = capabilitiesIn(label);
  const first = inside.values().next();
  return first.done ? label.trim() : first.value;
}
