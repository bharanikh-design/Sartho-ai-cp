/*
 * A résumé as a document, not a string.
 *
 * The drafting route asks the model for structure and gets it: a headline, a
 * summary, and sections of bullets each carrying the ids of the approved
 * evidence that backs it. Then it flattened all of that into one text column
 * and threw the rest away.
 *
 * Everything wrong with Résumé Studio followed from that single step:
 *
 *   - The draft could only be shown in a <pre>, in monospace, because a text
 *     blob has no structure to lay out. It looked like a terminal dump because
 *     that is what it was.
 *   - It could not be edited, because there is no safe way to edit a blob. So
 *     the only editing surface was a side rail that could reach the bullets the
 *     ATS had flagged and nothing else — not the summary, not a heading, not a
 *     typo, not a line that already had a number in it.
 *   - Templates were impossible. A template is a mapping from structure to
 *     layout, and there was no structure to map.
 *   - The per-bullet evidence ids — the one thing that makes this résumé
 *     provable rather than plausible — were reduced to a single flat list.
 *
 * So the structure is kept. This module owns both directions of the
 * conversion, in one place, so the stored text and the stored structure cannot
 * drift: renderResumeText is the only encoder, contentFromText the only
 * decoder, and a round-trip test holds them to each other.
 */

/** The literal heading the encoder writes above the summary paragraph. */
import { DEFAULT_TEMPLATE, normaliseTemplate, type ResumeTemplateId } from "@/lib/resume/templates";

export const SUMMARY_HEADING = "PROFESSIONAL SUMMARY";

/*
 * A bullet marker as people actually write them — the same set the ATS reader
 * recognises, so a pasted CV and a generated one are split the same way.
 */
const BULLET_MARKER = /^[••‣◦⁃∙*·–—-]\s+/;

export type ResumeBullet = {
  /**
   * Stable within a document, so a React key, an ATS flag and an in-progress
   * edit all point at the same line. Derived from position when a document is
   * parsed, so the same input always yields the same ids.
   */
  id: string;
  text: string;
  /**
   * The approved evidence backing this line. Empty means unbacked — either the
   * person wrote it themselves, or it came from a draft saved before the
   * structure was kept. Never treated as backing that simply went missing.
   */
  evidenceIds: string[];
  /** True once a person has changed the line from what the evidence backed. */
  edited: boolean;
};

export type ResumeSection = {
  id: string;
  heading: string;
  bullets: ResumeBullet[];
};

/*
 * The contact block, which no résumé has ever gone without and this document
 * had no room for.
 *
 * Every field is a plain string and every one may be empty. A résumé that
 * states a phone number nobody gave it is worse than one that states none, so
 * nothing here is ever inferred: what the import could not find stays blank
 * and the person fills it in.
 */
export type ResumeContact = {
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
};

/*
 * One job: what you did, where, and when.
 *
 * This is the entry every professional template is built around — title and
 * employer on a line, dates beside or beneath them, the bullets underneath. Its
 * absence is the whole reason six templates could only ever be six typefaces:
 * a section was a heading and a flat list, so there was nothing to lay out.
 *
 * The dates are strings, deliberately. A CV says "2019", "Jan 2022", "Present",
 * "2021 – current"; parsing that into a date type invents a precision nobody
 * supplied and then prints it back as though somebody had.
 */
export type ResumeRole = {
  id: string;
  title: string;
  employer: string;
  location: string;
  start: string;
  end: string;
  /** When true the end date is not printed, however it was stored. */
  current: boolean;
  bullets: ResumeBullet[];
};

export type ResumeEducation = {
  id: string;
  qualification: string;
  institution: string;
  year: string;
};

export type ResumeContent = {
  /*
   * Name and target role, apart. They were one `headline` string, which is why
   * no template could set the name large and the role beneath it — the two were
   * one line of text with a dash somewhere in the middle.
   */
  name: string;
  targetRole: string;
  contact: ResumeContact;
  summary: string;
  /** Dated employment, in the order they should be read: newest first. */
  roles: ResumeRole[];
  /*
   * Everything that is not dated employment — projects, certifications, a
   * section somebody made up — and every document saved before roles existed.
   * Kept for both reasons: dropping it would silently empty every draft in the
   * database.
   */
  sections: ResumeSection[];
  skills: string[];
  education: ResumeEducation[];
  /**
   * How it is set on the page. Part of the document because it is a decision
   * about this résumé, not a preference about the app — two drafts for two
   * different employers can reasonably want different typography.
   */
  template: ResumeTemplateId;
};

/*
 * The separator between a name and a target role, in the one place both the
 * encoder and the legacy splitter can read it.
 */
const HEADLINE_JOIN = " — ";
const HEADLINE_SPLIT = /\s+[—–|·]\s+/;

/** The first line of the document: "Priya Raman — Financial Analyst". */
export function headlineOf(content: Pick<ResumeContent, "name" | "targetRole">): string {
  return [content.name.trim(), content.targetRole.trim()].filter(Boolean).join(HEADLINE_JOIN);
}

/*
 * A stored `headline` split back into the two fields it always was.
 *
 * With no separator the whole line is the name — never the role. Getting that
 * backwards would put somebody's job title where their name belongs on every
 * template at once, and a missing target role is invisible while a missing name
 * is the first thing a reader notices.
 */
export function splitHeadline(headline: string): { name: string; targetRole: string } {
  const trimmed = headline.trim();
  if (!trimmed) return { name: "", targetRole: "" };
  const parts = trimmed.split(HEADLINE_SPLIT);
  if (parts.length < 2) return { name: trimmed, targetRole: "" };
  return { name: parts[0].trim(), targetRole: parts.slice(1).join(HEADLINE_JOIN).trim() };
}

/** "Jan 2022 – Present", or whichever half of it exists. */
export function roleDates(role: Pick<ResumeRole, "start" | "end" | "current">): string {
  const start = role.start.trim();
  const end = role.current ? "Present" : role.end.trim();
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

/** "Deloitte · Sydney", or whichever half of it exists. */
export function roleWhere(role: Pick<ResumeRole, "employer" | "location">): string {
  return [role.employer.trim(), role.location.trim()].filter(Boolean).join(" · ");
}

/** The contact line, as one string: only the fields that were filled in. */
export function contactLine(contact: ResumeContact): string {
  return [contact.email, contact.phone, contact.location, contact.linkedin, contact.website]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

export function emptyContact(): ResumeContact {
  return { email: "", phone: "", location: "", linkedin: "", website: "" };
}

function bulletId(sectionIndex: number, bulletIndex: number) {
  return `s${sectionIndex}b${bulletIndex}`;
}

function sectionId(sectionIndex: number) {
  return `s${sectionIndex}`;
}

/* Role bullets are numbered in their own space, so no id can mean two lines. */
function roleId(roleIndex: number) {
  return `r${roleIndex}`;
}

function roleBulletId(roleIndex: number, bulletIndex: number) {
  return `r${roleIndex}b${bulletIndex}`;
}

export function emptyContent(): ResumeContent {
  return {
    name: "",
    targetRole: "",
    contact: emptyContact(),
    summary: "",
    roles: [],
    sections: [],
    skills: [],
    education: [],
    template: DEFAULT_TEMPLATE,
  };
}

/** Whether a document carries anything worth rendering. */
export function hasContent(content: ResumeContent | null): content is ResumeContent {
  if (!content) return false;
  return Boolean(
    content.name
    || content.targetRole
    || content.summary
    || content.roles.length
    || content.sections.length
    || content.skills.length
    || content.education.length,
  );
}

/* The literal headings the encoder writes above each block. */
export const EXPERIENCE_HEADING = "EXPERIENCE";
export const SKILLS_HEADING = "SKILLS";
export const EDUCATION_HEADING = "EDUCATION";

/*
 * The one encoder.
 *
 * resume_draft is what the ATS reader scores, what the copy button copies, and
 * what every version already saved looks like. Editing the document and saving
 * re-runs this, which is what keeps the text column honest about the structure
 * beside it.
 *
 * The new blocks are written only when they carry something. A document with no
 * contact details, no dated roles, no skills and no education — which is every
 * document saved before those existed — therefore encodes to exactly the bytes
 * it always did, and the re-encoding test that guards that is not a formality:
 * silently rewriting the stored text of every historic version would change
 * what the ATS reader scores for drafts nobody has touched in months.
 */
export function renderResumeText(content: ResumeContent): string {
  const lines: string[] = [headlineOf(content)];

  const contact = contactLine(content.contact);
  if (contact) lines.push(contact);

  lines.push("", SUMMARY_HEADING, content.summary.trim(), "");

  if (content.roles.length) {
    lines.push(EXPERIENCE_HEADING);
    for (const role of content.roles) {
      /*
       * Title and employer on one line, dates on the next. A parser reads down
       * the page, so a role whose dates sit out to the right of its title is a
       * role whose dates it may attach to the wrong job — the same failure a
       * two-column layout causes, in miniature.
       */
      lines.push([role.title.trim(), roleWhere(role)].filter(Boolean).join(", "));
      const dates = roleDates(role);
      if (dates) lines.push(dates);
      lines.push(...role.bullets.map((bullet) => `• ${bullet.text.trim()}`), "");
    }
  }

  for (const section of content.sections) {
    lines.push(section.heading.toUpperCase(), ...section.bullets.map((bullet) => `• ${bullet.text.trim()}`), "");
  }

  if (content.skills.length) {
    lines.push(SKILLS_HEADING, content.skills.map((skill) => skill.trim()).filter(Boolean).join(" · "), "");
  }

  if (content.education.length) {
    lines.push(EDUCATION_HEADING);
    for (const entry of content.education) {
      lines.push([
        [entry.qualification.trim(), entry.institution.trim()].filter(Boolean).join(", "),
        entry.year.trim(),
      ].filter(Boolean).join(" — "));
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/*
 * A heading, as this encoder writes them: upper-cased, on its own line.
 *
 * Length-capped because a shouted sentence in a summary is not a section
 * break, and a real heading is a few words.
 */
function isHeading(line: string) {
  return line === line.toUpperCase() && /[A-Z]/.test(line) && line.length <= 80;
}

/*
 * The one decoder, and the reason every draft already saved becomes editable
 * rather than only the ones generated from now on.
 *
 * This is not guesswork over an arbitrary CV. It reverses the encoder directly
 * above it: the first line is the headline, an upper-cased line is a section
 * break, a marker line is a bullet. A format we wrote ourselves can be read
 * back with certainty, which is why the round-trip is a test and not a hope.
 *
 * The one thing that cannot be recovered is which evidence backed which line —
 * the old flattener kept only a flat list for the whole document. Recovered
 * bullets therefore carry no evidence ids, and the editor says so, rather than
 * implying a backing it cannot show.
 */
export function contentFromText(text: string): ResumeContent {
  const content = emptyContent();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return content;

  /*
   * The first line is the headline whatever it looks like. Taking it before
   * heading detection matters: a headline is often written in capitals, and
   * testing it as a heading would turn somebody's name into a section break.
   *
   * It is split back into the name and target role it always was. This decoder
   * reads text written before dated roles, contact blocks, skills or education
   * existed, so it recovers none of them — and claims none of them, rather than
   * guessing at a phone number from a line that looks like one.
   */
  Object.assign(content, splitHeadline(lines[0]));

  const summaryParts: string[] = [];
  let inSummary = false;
  let current: ResumeSection | null = null;

  for (const line of lines.slice(1)) {
    if (BULLET_MARKER.test(line)) {
      const bulletText = line.replace(BULLET_MARKER, "").trim();
      if (!bulletText) continue;
      if (!current) {
        current = { id: sectionId(content.sections.length), heading: "", bullets: [] };
        content.sections.push(current);
      }
      current.bullets.push({
        id: bulletId(content.sections.length - 1, current.bullets.length),
        text: bulletText,
        evidenceIds: [],
        edited: false,
      });
      continue;
    }

    if (isHeading(line)) {
      if (line === SUMMARY_HEADING) {
        inSummary = true;
        current = null;
        continue;
      }
      inSummary = false;
      current = { id: sectionId(content.sections.length), heading: line, bullets: [] };
      content.sections.push(current);
      continue;
    }

    /*
     * Prose. Inside the summary it is the summary; inside a section it is a
     * line the encoder did not mark as a bullet, and dropping it would lose
     * somebody's words, so it is kept as one.
     */
    if (inSummary || !current) {
      summaryParts.push(line);
      continue;
    }
    current.bullets.push({
      id: bulletId(content.sections.length - 1, current.bullets.length),
      text: line,
      evidenceIds: [],
      edited: false,
    });
  }

  content.summary = summaryParts.join(" ");
  return content;
}

/*
 * A stored content column, brought up to the current shape.
 *
 * Never a bare `as ResumeContent`. This is JSON written by whatever version of
 * the app was deployed when it was saved, and casting stored JSON is the exact
 * mistake that took Find Roles down: it satisfies the compiler and does
 * nothing at all at runtime.
 *
 * Returns null rather than an empty document when there is no usable structure,
 * so the caller can fall back to reading the text column instead of rendering
 * a blank page.
 */
export function parseResumeContent(stored: unknown): ResumeContent | null {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const value = stored as Partial<ResumeContent>;

  const text = (input: unknown): string => (typeof input === "string" ? input : "");
  const strings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];

  const sections: ResumeSection[] = (Array.isArray(value.sections) ? value.sections : []).flatMap(
    (rawSection, sectionIndex) => {
      if (!rawSection || typeof rawSection !== "object") return [];
      const section = rawSection as Partial<ResumeSection>;
      const bullets: ResumeBullet[] = (Array.isArray(section.bullets) ? section.bullets : []).flatMap(
        (rawBullet, index) => {
          if (!rawBullet || typeof rawBullet !== "object") return [];
          const bullet = rawBullet as Partial<ResumeBullet>;
          const bulletText = text(bullet.text).trim();
          /* A line with no words is not a line; it would render as an empty bullet. */
          if (!bulletText) return [];
          return [{
            id: text(bullet.id) || bulletId(sectionIndex, index),
            text: bulletText,
            evidenceIds: strings(bullet.evidenceIds),
            edited: bullet.edited === true,
          }];
        },
      );
      const heading = text(section.heading).trim();
      if (!heading && !bullets.length) return [];
      return [{ id: text(section.id) || sectionId(sectionIndex), heading, bullets }];
    },
  );

  const roles: ResumeRole[] = (Array.isArray(value.roles) ? value.roles : []).flatMap((rawRole, roleIndex) => {
    if (!rawRole || typeof rawRole !== "object") return [];
    const role = rawRole as Partial<ResumeRole>;
    const bullets: ResumeBullet[] = (Array.isArray(role.bullets) ? role.bullets : []).flatMap((rawBullet, index) => {
      if (!rawBullet || typeof rawBullet !== "object") return [];
      const bullet = rawBullet as Partial<ResumeBullet>;
      const bulletText = text(bullet.text).trim();
      if (!bulletText) return [];
      return [{
        id: text(bullet.id) || roleBulletId(roleIndex, index),
        text: bulletText,
        evidenceIds: strings(bullet.evidenceIds),
        edited: bullet.edited === true,
      }];
    });
    const title = text(role.title).trim();
    const employer = text(role.employer).trim();
    /* A role with no title, no employer and nothing under it is not a role. */
    if (!title && !employer && !bullets.length) return [];
    return [{
      id: text(role.id) || roleId(roleIndex),
      title,
      employer,
      location: text(role.location).trim(),
      start: text(role.start).trim(),
      end: text(role.end).trim(),
      current: role.current === true,
      bullets,
    }];
  });

  const education: ResumeEducation[] = (Array.isArray(value.education) ? value.education : []).flatMap(
    (rawEntry, index) => {
      if (!rawEntry || typeof rawEntry !== "object") return [];
      const entry = rawEntry as Partial<ResumeEducation>;
      const qualification = text(entry.qualification).trim();
      const institution = text(entry.institution).trim();
      if (!qualification && !institution) return [];
      return [{ id: text(entry.id) || `ed${index}`, qualification, institution, year: text(entry.year).trim() }];
    },
  );

  const rawContact = (value.contact && typeof value.contact === "object" ? value.contact : {}) as Partial<ResumeContact>;
  const contact: ResumeContact = {
    email: text(rawContact.email).trim(),
    phone: text(rawContact.phone).trim(),
    location: text(rawContact.location).trim(),
    linkedin: text(rawContact.linkedin).trim(),
    website: text(rawContact.website).trim(),
  };

  /*
   * A document written before the name and the target role were separate
   * fields carries neither, and one `headline` string instead. Splitting it
   * here is the whole of the upgrade: every draft in the database opens with
   * its name where a name belongs, without anybody re-running anything.
   */
  const withLegacy = stored as { headline?: unknown };
  const legacy = splitHeadline(text(withLegacy.headline));
  const name = text(value.name).trim() || legacy.name;
  const targetRole = text(value.targetRole).trim() || legacy.targetRole;

  const content: ResumeContent = {
    name,
    targetRole,
    contact,
    summary: text(value.summary).trim(),
    roles,
    sections,
    skills: strings(value.skills).map((skill) => skill.trim()).filter(Boolean),
    education,
    template: normaliseTemplate(value.template),
  };
  return hasContent(content) ? content : null;
}

/*
 * The document to edit, whichever way it was stored.
 *
 * Structure when it is there, and the text column read back when it is not —
 * so a draft saved months before any of this existed opens in the same editor
 * as one generated today.
 */
export function resumeContentOf(storedContent: unknown, storedText: string | null): ResumeContent | null {
  const parsed = parseResumeContent(storedContent);
  if (parsed) return parsed;
  const text = (storedText ?? "").trim();
  if (!text) return null;
  const recovered = contentFromText(text);
  return hasContent(recovered) ? recovered : null;
}

/*
 * Every evidence id the document still cites, de-duplicated.
 *
 * Roles are read as well as sections. Missing them would drop the backing for
 * most of a modern draft — the bullets moved into dated roles — and the version
 * would be stored claiming evidence for nothing, which is the one thing this
 * product must never get wrong.
 */
export function evidenceIdsIn(content: ResumeContent): string[] {
  const fromRoles = content.roles.flatMap((role) => role.bullets.flatMap((bullet) => bullet.evidenceIds));
  const fromSections = content.sections.flatMap((section) => section.bullets.flatMap((bullet) => bullet.evidenceIds));
  return [...new Set([...fromRoles, ...fromSections])];
}
