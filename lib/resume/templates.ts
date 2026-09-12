/*
 * What a template is, and the one thing it must never quietly cost you.
 *
 * The gallery every résumé builder sells is mostly two-column, and a second
 * column is the single most common reason an applicant tracking system parses a
 * candidate into nonsense — it reads across the page, so a sidebar of skills
 * lands interleaved with the employment history.
 *
 * The answer taken here is not to ban design. It is that the two files a person
 * downloads are for two different readers, and can therefore be different
 * documents:
 *
 *   The Word file goes to the applicant tracking system. It is single column,
 *   real heading styles, real bullet lists, no tables and no text boxes, on
 *   every template without exception. Nothing in this file can make it
 *   otherwise.
 *
 *   The PDF goes to a person — attached to an email, handed across a table,
 *   posted to somebody who asked for it. It can be as designed as it likes,
 *   because a human reads it with their eyes.
 *
 * So a template says how the PDF looks, and `atsSafe` says whether that PDF
 * would also survive a parser. A sidebar template is not hidden or discouraged;
 * it is labelled, and the Word file beside it is safe regardless. Zety sells
 * you the sidebar and does not mention the cost. This names it and then removes
 * it.
 *
 * The other half of this file was a lie worth naming. Seven templates were
 * described here — a coloured left bar, a solid accent bar, letterspaced
 * capitals over a double rule — and the PDF renderer read one field, the font,
 * and drew every one of them identically in Helvetica or Times. "Innovator"
 * described itself as "a striking two-column design" and rendered a single
 * column. The descriptions below are now rendered rather than asserted.
 */

export type ResumeTemplateId =
  | "classic"
  | "modern"
  | "executive"
  | "impact"
  | "editorial"
  | "compact"
  | "innovator"
  | "atlas";

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

/*
 * How the PDF draws, per template.
 *
 * Tokens rather than seven renderers: a template is a set of values, and one
 * renderer reads them. That is what stops a description in this file drifting
 * away from what the page actually does, which is precisely what happened when
 * the renderer read only the font.
 */
export type ResumeTemplatePdf = {
  /** Built into react-pdf, so no font file has to load before a page can draw. */
  font: "Helvetica" | "Times-Roman";
  /** A sidebar holds contact, skills and education; the main column holds the career. */
  layout: "single" | "sidebar";
  /** The one colour a template is allowed. More than one reads as a brochure. */
  accent: string;
  ink: string;
  muted: string;
  nameSize: number;
  nameAlign: "left" | "center";
  nameCaps: boolean;
  /** Letterspacing on the name, in points. */
  nameTracking: number;
  /**
   * rule      a hairline under the heading
   * doubleRule a hairline above and below, for the formal templates
   * bar       the heading sits on a solid accent block
   * edge      a short thick accent stroke to the left of the heading
   * plain     nothing but weight and spacing
   */
  heading: "rule" | "doubleRule" | "bar" | "edge" | "plain";
  headingSize: number;
  headingCaps: boolean;
  bodySize: number;
  lineHeight: number;
  pagePadding: number;
  /** Sidebar only. */
  sidebarWidth?: number;
  sidebarInk?: string;
  sidebarMuted?: string;
};

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
  /**
   * Whether this template's PDF would also survive a parser.
   *
   * False does not mean avoid it. The Word file is single column on every
   * template, so the document that reaches an applicant tracking system is safe
   * whatever is chosen here — this only says which of the two files to attach
   * where, and it is said out loud rather than left for somebody to discover.
   */
  atsSafe: boolean;
  pdf: ResumeTemplatePdf;
  docx: ResumeDocxStyle;
};

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: "innovator",
    name: "Innovator",
    description: "A deep teal sidebar carrying contact, skills and education, with the career given the full main column.",
    bestFor: "Design, product and technology, and anywhere the page is read by a person before a parser.",
    atsSafe: false,
    pdf: {
      font: "Helvetica", layout: "sidebar", accent: "#0f4c4c", ink: "#15211d", muted: "#5b6a63",
      nameSize: 24, nameAlign: "left", nameCaps: false, nameTracking: 0,
      heading: "edge", headingSize: 9.5, headingCaps: true, bodySize: 9.2, lineHeight: 1.38, pagePadding: 0,
      sidebarWidth: 178, sidebarInk: "#ffffff", sidebarMuted: "#bcd6d2",
    },
    docx: { font: "Helvetica", nameAlign: "left", nameSize: 36, bodySize: 22, headingSize: 24, headingUpper: true, headingRule: false },
  },
  {
    id: "atlas",
    name: "Atlas",
    description: "A navy sidebar under a serif name — the two-column look, in a register that suits a long career.",
    bestFor: "Senior consulting, professional services and anyone whose page is opened by a partner, not a filter.",
    atsSafe: false,
    pdf: {
      font: "Times-Roman", layout: "sidebar", accent: "#16243f", ink: "#161b22", muted: "#5a6472",
      nameSize: 26, nameAlign: "left", nameCaps: false, nameTracking: 0,
      heading: "rule", headingSize: 10, headingCaps: true, bodySize: 9.5, lineHeight: 1.4, pagePadding: 0,
      sidebarWidth: 172, sidebarInk: "#ffffff", sidebarMuted: "#b3c0d6",
    },
    docx: { font: "Georgia", nameAlign: "left", nameSize: 34, bodySize: 22, headingSize: 23, headingUpper: true, headingRule: true },
  },
  {
    id: "classic",
    name: "Classic",
    description: "Serif throughout, the name centred over a rule, headings ruled beneath.",
    bestFor: "Law, banking, government, academia — anywhere convention is the point.",
    atsSafe: true,
    pdf: {
      font: "Times-Roman", layout: "single", accent: "#1a1a1a", ink: "#16211a", muted: "#5a655e",
      nameSize: 25, nameAlign: "center", nameCaps: false, nameTracking: 0,
      heading: "rule", headingSize: 10, headingCaps: true, bodySize: 9.6, lineHeight: 1.38, pagePadding: 44,
    },
    docx: { font: "Times New Roman", nameAlign: "center", nameSize: 32, bodySize: 22, headingSize: 24, headingUpper: true, headingRule: true },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Sans-serif, name to the left, headings in plain weight with generous air and no rules at all.",
    bestFor: "Technology, product, startups, consulting.",
    atsSafe: true,
    pdf: {
      font: "Helvetica", layout: "single", accent: "#1f6feb", ink: "#141a17", muted: "#5b6a63",
      nameSize: 24, nameAlign: "left", nameCaps: false, nameTracking: 0,
      heading: "plain", headingSize: 9.5, headingCaps: true, bodySize: 9.3, lineHeight: 1.36, pagePadding: 44,
    },
    docx: { font: "Calibri", nameAlign: "left", nameSize: 32, bodySize: 22, headingSize: 24, headingUpper: true, headingRule: false },
  },
  {
    id: "executive",
    name: "Executive",
    description: "The name in letterspaced capitals between two rules, headings ruled above and below.",
    bestFor: "Director and C-suite roles, board applications, senior partner tracks.",
    atsSafe: true,
    pdf: {
      font: "Times-Roman", layout: "single", accent: "#1a1a2e", ink: "#14181f", muted: "#59616e",
      nameSize: 22, nameAlign: "center", nameCaps: true, nameTracking: 3.2,
      heading: "doubleRule", headingSize: 9.5, headingCaps: true, bodySize: 9.5, lineHeight: 1.4, pagePadding: 46,
    },
    docx: { font: "Georgia", nameAlign: "center", nameSize: 36, bodySize: 22, headingSize: 22, headingUpper: true, headingRule: true },
  },
  {
    id: "impact",
    name: "Impact",
    description: "A very large name, and every section heading reversed out of a solid accent block.",
    bestFor: "Sales, marketing, design, and any market where the pile is deep.",
    atsSafe: true,
    pdf: {
      font: "Helvetica", layout: "single", accent: "#c2410c", ink: "#171311", muted: "#6b5d57",
      nameSize: 30, nameAlign: "left", nameCaps: false, nameTracking: -0.4,
      heading: "bar", headingSize: 9, headingCaps: true, bodySize: 9.2, lineHeight: 1.34, pagePadding: 42,
    },
    docx: { font: "Arial", nameAlign: "left", nameSize: 44, bodySize: 21, headingSize: 24, headingUpper: true, headingRule: true },
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Serif body with a short accent stroke beside every heading, set in mixed case with wide leading.",
    bestFor: "Communications, policy, research, and roles judged on how you write.",
    atsSafe: true,
    pdf: {
      font: "Times-Roman", layout: "single", accent: "#7c2d12", ink: "#1a1614", muted: "#6a5d56",
      nameSize: 25, nameAlign: "left", nameCaps: false, nameTracking: 0,
      heading: "edge", headingSize: 10.5, headingCaps: false, bodySize: 9.7, lineHeight: 1.48, pagePadding: 48,
    },
    docx: { font: "Cambria", nameAlign: "left", nameSize: 34, bodySize: 22, headingSize: 22, headingUpper: false, headingRule: false },
  },
  {
    id: "compact",
    name: "Compact",
    description: "Smaller type, tight leading and rules that run the full width. Fits a long history on two pages.",
    bestFor: "Fifteen years of history that has to fit on two pages.",
    atsSafe: true,
    pdf: {
      font: "Helvetica", layout: "single", accent: "#374151", ink: "#171b18", muted: "#626c66",
      nameSize: 20, nameAlign: "left", nameCaps: false, nameTracking: 0,
      heading: "rule", headingSize: 8.6, headingCaps: true, bodySize: 8.7, lineHeight: 1.28, pagePadding: 36,
    },
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
