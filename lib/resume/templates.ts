/*
 * Six templates, and every one of them a single column.
 *
 * The gallery every résumé builder sells is mostly two-column, and a second
 * column is the single most common reason an applicant tracking system parses a
 * candidate into nonsense — it reads across the page, so a sidebar of skills
 * lands interleaved with the employment history. Sidebars, icons, photos, skill
 * bars and contact details in a header all fail the same way.
 *
 * That constraint is not the same as having no design, which is what two
 * templates amounted to. Everything a good template actually does — the weight
 * and tracking of the name, whether headings sit on a rule or against a bar,
 * how much air a section gets, the type pairing — happens inside one column and
 * changes how a page reads enormously.
 *
 * So the honest claim is unchanged and now worth more: these all parse
 * identically, and choosing one changes the typography, not your chances.
 */

export type ResumeTemplateId = "classic" | "modern" | "executive" | "impact" | "editorial" | "compact";

/*
 * What the Word file does, per template.
 *
 * Previously only the font changed, so a person who picked a template on screen
 * and downloaded .docx got the same document in a different typeface — the
 * choice they made was silently discarded at the one moment it mattered most,
 * because the Word file is what actually gets sent.
 *
 * Everything here is still parser-safe: a real Heading 1 style, a real bullet
 * list, one column, no tables and no text boxes. Alignment, size and a
 * paragraph border are formatting, and no ATS cares about any of them.
 */
export type ResumeDocxStyle = {
  /** Metrically ordinary and present on every machine: a substituted font repaginates the file. */
  font: string;
  nameAlign: "center" | "left";
  /** Half-points, so 32 is 16pt. */
  nameSize: number;
  bodySize: number;
  headingSize: number;
  headingUpper: boolean;
  /** A hairline under each section heading. */
  headingRule: boolean;
};

export type ResumeTemplate = {
  id: ResumeTemplateId;
  name: string;
  /** What a reader notices, in a phrase. */
  description: string;
  /** Who it is for, so the choice is not made on the name alone. */
  bestFor: string;
  docx: ResumeDocxStyle;
};

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Serif, centred name, ruled section headings.",
    bestFor: "Law, banking, government, academia — anywhere convention is the point.",
    docx: { font: "Times New Roman", nameAlign: "center", nameSize: 32, bodySize: 22, headingSize: 24, headingUpper: true, headingRule: true },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Sans-serif, name to the left, tighter leading. Fits more on a page.",
    bestFor: "Technology, product, startups, consulting.",
    docx: { font: "Calibri", nameAlign: "left", nameSize: 32, bodySize: 22, headingSize: 24, headingUpper: true, headingRule: false },
  },
  {
    id: "executive",
    name: "Executive",
    description: "The name set large in letterspaced capitals over a double rule, headings in small caps.",
    bestFor: "Director and C-suite roles, board applications, senior partner tracks.",
    docx: { font: "Georgia", nameAlign: "center", nameSize: 36, bodySize: 22, headingSize: 22, headingUpper: true, headingRule: true },
  },
  {
    id: "impact",
    name: "Impact",
    description: "A very large name over a solid accent bar, with heavy uppercase headings.",
    bestFor: "Sales, marketing, design, and any market where the pile is deep.",
    docx: { font: "Arial", nameAlign: "left", nameSize: 44, bodySize: 21, headingSize: 24, headingUpper: true, headingRule: true },
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Serif body, sans headings against a coloured left bar, generous leading.",
    bestFor: "Communications, policy, research, and roles judged on how you write.",
    docx: { font: "Cambria", nameAlign: "left", nameSize: 34, bodySize: 22, headingSize: 22, headingUpper: false, headingRule: false },
  },
  {
    id: "compact",
    name: "Compact",
    description: "Smaller type and tight leading, headings on a rule that runs to the edge.",
    bestFor: "Fifteen years of history that has to fit on two pages.",
    docx: { font: "Calibri", nameAlign: "left", nameSize: 28, bodySize: 20, headingSize: 21, headingUpper: true, headingRule: true },
  },
];

export const DEFAULT_TEMPLATE: ResumeTemplateId = "classic";

/** Every id, for the places that must accept all of them — the stored-document schema above all. */
export const RESUME_TEMPLATE_IDS = RESUME_TEMPLATES.map((template) => template.id) as [ResumeTemplateId, ...ResumeTemplateId[]];

const byId = new Map(RESUME_TEMPLATES.map((template) => [template.id, template]));

/** A stored template id, or the default when it is missing or unrecognised. */
export function normaliseTemplate(value: unknown): ResumeTemplateId {
  return typeof value === "string" && byId.has(value as ResumeTemplateId)
    ? (value as ResumeTemplateId)
    : DEFAULT_TEMPLATE;
}

export function resumeTemplate(id: unknown): ResumeTemplate {
  return byId.get(normaliseTemplate(id)) as ResumeTemplate;
}
