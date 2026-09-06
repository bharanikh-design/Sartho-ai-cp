/*
 * Two templates, and no third.
 *
 * Every résumé builder on the market sells a gallery, and most of that gallery
 * is actively bad for the person using it. The pretty ones are two-column, and
 * a second column is the single most common reason an applicant tracking system
 * parses a candidate into nonsense — it reads across the page, so a sidebar of
 * skills lands interleaved with the employment history. Sidebars, icons, photos,
 * skill bars and header-footer contact details all fail the same way.
 *
 * So both of these are one column, with real headings and real bullet lists,
 * and they parse identically. What differs is what a person sees, and that is
 * said plainly rather than dressed up as an ATS advantage nobody can measure:
 * choosing a template here changes the typography, not your chances.
 *
 * A gallery of ten would be easy to build and would be the most dishonest
 * screen in the product.
 */

export type ResumeTemplateId = "classic" | "modern";

export type ResumeTemplate = {
  id: ResumeTemplateId;
  name: string;
  /** What a reader notices, in a phrase. */
  description: string;
  /** The Word font, so the file matches what was chosen on screen. */
  docxFont: string;
};

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Serif, centred name, ruled section headings. What a law firm or a bank expects.",
    docxFont: "Times New Roman",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Sans-serif, name to the left, tighter leading. Fits more on a page.",
    docxFont: "Calibri",
  },
];

export const DEFAULT_TEMPLATE: ResumeTemplateId = "classic";

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
