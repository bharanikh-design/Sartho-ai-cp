import type { ResumeContent } from "@/lib/resume/content";
import { roleDates } from "@/lib/resume/content";

/*
 * Did the file survive being read back?
 *
 * The one check that corresponds to something an applicant tracking system
 * actually does. The Word and PDF files are built, then read back by the same
 * parsers the import uses, and the text is searched for every fact the
 * document was supposed to carry: the name, each role's title, employer and
 * dates, the first line under each, every section heading, the skills, the
 * certifications, the education, and the contact details. A fact that does
 * not come back was lost in the file, and a role that comes back out of
 * order was attributed to the wrong dates.
 */

export type ParseItem = { label: string; text: string; found: boolean };

export type ParseFidelity = {
  items: ParseItem[];
  found: number;
  total: number;
  /** Whether the roles came back in the order they were written. */
  orderPreserved: boolean;
  ok: boolean;
};

function squash(value: string) {
  return ` ${value
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[^\p{L}\p{N}@.+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

export function parseFidelity(content: ResumeContent, extractedText: string): ParseFidelity {
  const haystack = squash(extractedText);
  const has = (text: string) => {
    const needle = squash(text).trim();
    return needle.length > 0 && haystack.includes(` ${needle} `);
  };

  const expected: Array<{ label: string; text: string }> = [];
  const add = (label: string, text: string) => { if (text.trim()) expected.push({ label, text: text.trim() }); };

  add("Name", content.name);
  add("Email", content.contact.email);
  add("Phone", content.contact.phone);
  content.roles.forEach((role, index) => {
    add(`Role ${index + 1} title`, role.title);
    add(`Role ${index + 1} employer`, role.employer);
    add(`Role ${index + 1} dates`, roleDates(role));
    const first = role.bullets.find((bullet) => bullet.text.trim());
    if (first) add(`Role ${index + 1} first line`, first.text);
  });
  for (const section of content.sections) add("Section heading", section.heading);
  for (const skill of content.skills.slice(0, 6)) add("Skill", skill);
  for (const group of content.skillGroups) for (const skill of group.skills.slice(0, 3)) add("Skill", skill);
  for (const entry of content.certifications) add("Certification", entry.name);
  for (const entry of content.education) add("Qualification", entry.qualification);

  const items = expected.map((entry) => ({ ...entry, found: has(entry.text) }));

  /* Roles in the order they were found, compared with the order they were written. */
  const positions = content.roles
    .map((role) => role.title.trim() || role.employer.trim())
    .filter(Boolean)
    .map((text) => haystack.indexOf(` ${squash(text).trim()} `))
    .filter((position) => position >= 0);
  const orderPreserved = positions.every((position, index) => index === 0 || position >= positions[index - 1]);

  const found = items.filter((item) => item.found).length;
  return { items, found, total: items.length, orderPreserved, ok: found === items.length && orderPreserved };
}
