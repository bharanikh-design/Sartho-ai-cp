import { z } from "zod";
import type { ResumeBullet, ResumeContent } from "@/lib/resume/content";
import { DEFAULT_TEMPLATE } from "@/lib/resume/templates";

/*
 * Laying an uploaded résumé out as a document the editor can open.
 *
 * The editor works on structure — a name, a summary, dated roles with bullets,
 * sections, skills, education — and an upload is kept as text. Something has
 * to say which line is a job title and which is a bullet under it, and that
 * something is a model reading the text.
 *
 * What it is not allowed to do is write. The person's résumé is the record,
 * and the whole point of keeping it as uploaded is that Sartho does not
 * quietly improve it. So the rules here are the opposite of the drafting
 * rules elsewhere: copy every line word for word, place it, add nothing,
 * drop nothing. Editing is the person's job, in the editor, afterwards.
 */

export const STRUCTURE_UPLOAD_RULES = [
  "You convert the plain text of a person's own résumé into a structured document. You are a typesetter, not a writer.",
  "Copy, never compose. Every heading, sentence, bullet, figure, date, employer, job title, qualification and skill in the output must be taken word for word from the text you are given. Do not rephrase, shorten, expand, merge, split, correct spelling, change tense, or add anything that is not in the text.",
  "Every line of the résumé must appear in exactly one place in the output. Nothing may be left out. If a line fits no field, put it as a bullet in a section whose heading is the heading it appeared under in the résumé, or 'Additional information' if it had none.",
  "name is the person's name as written at the top. targetRole is the job title line written under the name if there is one, otherwise empty.",
  "contact fields are copied exactly where the résumé states them and left empty where it does not. Never invent an email address, phone number, location or link.",
  "summary is the résumé's own profile or summary paragraph, unchanged. Empty if there is none.",
  "roles are the dated employment entries, in the order they appear. title, employer, location, start and end are copied as written; dates keep their original wording such as '2019', 'Jan 2022' or 'Present'. current is true only when the résumé says the role is ongoing. bullets are that role's own bullet points or sentences, one per bullet, unchanged and in their original order.",
  "sections hold everything that is not dated employment, the summary, skills or education — projects, certifications, awards, publications, and any other heading — each under the résumé's own heading with its lines as bullets, unchanged.",
  "skills are the entries of the résumé's own skills section, split only on the separators the résumé itself uses, each unchanged. Empty if there is no such section. When the résumé groups its skills under labels such as 'Languages', 'Tools' or 'Platforms', put each group in skillGroups with the label as its name and leave skills for the ungrouped ones.",
  "certifications are the résumé's own certifications, licences and professional standards, each with its issuer and year as written, and not repeated under education or skills.",
  "education entries copy the qualification, institution and year as written.",
].join(" ");

/*
 * No minItems or maxItems: strict structured outputs reject both. Bounds are
 * enforced by the Zod parse below.
 */
export const STRUCTURE_UPLOAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "targetRole", "contact", "summary", "roles", "sections", "skills", "skillGroups", "certifications", "education"],
  properties: {
    name: { type: "string" },
    targetRole: { type: "string" },
    contact: {
      type: "object",
      additionalProperties: false,
      required: ["email", "phone", "location", "linkedin", "website"],
      properties: {
        email: { type: "string" }, phone: { type: "string" }, location: { type: "string" },
        linkedin: { type: "string" }, website: { type: "string" },
      },
    },
    summary: { type: "string" },
    roles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "employer", "location", "start", "end", "current", "bullets"],
        properties: {
          title: { type: "string" }, employer: { type: "string" }, location: { type: "string" },
          start: { type: "string" }, end: { type: "string" }, current: { type: "boolean" },
          bullets: { type: "array", items: { type: "string" } },
        },
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "bullets"],
        properties: { heading: { type: "string" }, bullets: { type: "array", items: { type: "string" } } },
      },
    },
    skills: { type: "array", items: { type: "string" } },
    skillGroups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "skills"],
        properties: { name: { type: "string" }, skills: { type: "array", items: { type: "string" } } },
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "issuer", "year"],
        properties: { name: { type: "string" }, issuer: { type: "string" }, year: { type: "string" } },
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["qualification", "institution", "year"],
        properties: { qualification: { type: "string" }, institution: { type: "string" }, year: { type: "string" } },
      },
    },
  },
};

const line = z.string().max(2_000);

export const structuredUploadOutput = z.object({
  name: z.string().max(200),
  targetRole: z.string().max(200),
  contact: z.object({
    email: z.string().max(320),
    phone: z.string().max(60),
    location: z.string().max(160),
    linkedin: z.string().max(300),
    website: z.string().max(300),
  }),
  summary: z.string().max(4_000),
  roles: z.array(z.object({
    title: z.string().max(200),
    employer: z.string().max(200),
    location: z.string().max(160),
    start: z.string().max(60),
    end: z.string().max(60),
    current: z.boolean(),
    bullets: z.array(line).max(40),
  })).max(30),
  sections: z.array(z.object({ heading: z.string().max(200), bullets: z.array(line).max(60) })).max(20),
  skills: z.array(z.string().max(80)).max(60),
  /* Optional so an answer from before the fields existed still parses. */
  skillGroups: z.array(z.object({ name: z.string().max(120), skills: z.array(z.string().max(80)).max(40) })).max(12).optional(),
  certifications: z.array(z.object({ name: z.string().max(200), issuer: z.string().max(200), year: z.string().max(60) })).max(20).optional(),
  education: z.array(z.object({
    qualification: z.string().max(200),
    institution: z.string().max(200),
    year: z.string().max(60),
  })).max(15),
});

export type StructuredUpload = z.infer<typeof structuredUploadOutput>;

/*
 * The model's reading, made into the editor's document.
 *
 * Every bullet is unbacked on purpose: these lines were not drawn from
 * approved evidence, they are the person's own words, and claiming a receipt
 * for them would be the one dishonest thing this file could do. `edited` is
 * false because nobody has touched them yet.
 */
export function contentFromStructuredUpload(
  parsed: StructuredUpload,
  options: { importId: string; fallbackEmail?: string },
): ResumeContent {
  const bullets = (lines: string[], prefix: string): ResumeBullet[] =>
    lines
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, index) => ({ id: `${prefix}b${index}`, text, evidenceIds: [], edited: false }));

  const roles = parsed.roles
    .map((role, index) => ({
      id: `r${index}`,
      title: role.title.trim(),
      employer: role.employer.trim(),
      location: role.location.trim(),
      start: role.start.trim(),
      end: role.end.trim(),
      current: role.current,
      bullets: bullets(role.bullets, `r${index}`),
    }))
    .filter((role) => role.title || role.employer || role.bullets.length);

  const sections = parsed.sections
    .map((section, index) => ({ id: `s${index}`, heading: section.heading.trim(), bullets: bullets(section.bullets, `s${index}`) }))
    .filter((section) => section.heading || section.bullets.length);

  const education = parsed.education
    .map((entry, index) => ({
      id: `ed${index}`,
      qualification: entry.qualification.trim(),
      institution: entry.institution.trim(),
      year: entry.year.trim(),
    }))
    .filter((entry) => entry.qualification || entry.institution);

  return {
    template: DEFAULT_TEMPLATE,
    name: parsed.name.trim(),
    targetRole: parsed.targetRole.trim(),
    contact: {
      email: parsed.contact.email.trim() || (options.fallbackEmail ?? "").trim(),
      phone: parsed.contact.phone.trim(),
      location: parsed.contact.location.trim(),
      linkedin: parsed.contact.linkedin.trim(),
      website: parsed.contact.website.trim(),
    },
    summary: parsed.summary.trim(),
    roles,
    sections,
    skills: parsed.skills.map((skill) => skill.trim()).filter(Boolean),
    education,
    skillGroups: (parsed.skillGroups ?? [])
      .map((group, index) => ({ id: `sg${index}`, name: group.name.trim(), skills: group.skills.map((skill) => skill.trim()).filter(Boolean) }))
      .filter((group) => group.skills.length),
    certifications: (parsed.certifications ?? [])
      .map((entry, index) => ({ id: `c${index}`, name: entry.name.trim(), issuer: entry.issuer.trim(), year: entry.year.trim() }))
      .filter((entry) => entry.name || entry.issuer),
    sourceImportId: options.importId,
  };
}

/*
 * How much of the résumé landed somewhere.
 *
 * Counted in words, not lines: a line of the file is routinely split across
 * fields — an employer, a title and a date range live on one line in a CV and
 * in three fields here — so line matching would call a perfect layout
 * incomplete. A word is placed when it appears anywhere in the document.
 * Reported, not enforced, so a person can see at a glance whether the layout
 * is complete rather than trusting that it is.
 */
export function placedWordShare(rawText: string, content: ResumeContent): { placed: number; total: number } {
  const words = (value: string) => new Set((value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.+#-]*/gu) ?? []).filter((word) => word.length >= 2));
  const placedWords = words([
    content.name, content.targetRole, content.summary,
    content.contact.email, content.contact.phone, content.contact.location, content.contact.linkedin, content.contact.website,
    ...content.roles.flatMap((role) => [role.title, role.employer, role.location, role.start, role.end, ...role.bullets.map((b) => b.text)]),
    ...content.sections.flatMap((section) => [section.heading, ...section.bullets.map((b) => b.text)]),
    ...content.skills,
    ...content.skillGroups.flatMap((group) => [group.name, ...group.skills]),
    ...content.certifications.flatMap((entry) => [entry.name, entry.issuer, entry.year]),
    ...content.education.flatMap((entry) => [entry.qualification, entry.institution, entry.year]),
  ].join(" \n "));
  const source = words(rawText);
  let placed = 0;
  for (const word of source) if (placedWords.has(word)) placed += 1;
  return { placed, total: source.size };
}
