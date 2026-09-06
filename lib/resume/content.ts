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

export type ResumeContent = {
  headline: string;
  summary: string;
  sections: ResumeSection[];
  /**
   * How it is set on the page. Part of the document because it is a decision
   * about this résumé, not a preference about the app — two drafts for two
   * different employers can reasonably want different typography.
   */
  template: ResumeTemplateId;
};

function bulletId(sectionIndex: number, bulletIndex: number) {
  return `s${sectionIndex}b${bulletIndex}`;
}

function sectionId(sectionIndex: number) {
  return `s${sectionIndex}`;
}

export function emptyContent(): ResumeContent {
  return { headline: "", summary: "", sections: [], template: DEFAULT_TEMPLATE };
}

/** Whether a document carries anything worth rendering. */
export function hasContent(content: ResumeContent | null): content is ResumeContent {
  return Boolean(content && (content.headline || content.summary || content.sections.length));
}

/*
 * The one encoder.
 *
 * Byte-for-byte what the drafting route used to build inline, so resume_draft
 * keeps exactly the shape the ATS reader, the copy button and every stored
 * version already expect. Editing the document and saving re-runs this, which
 * is what keeps the text column honest about the structure beside it.
 */
export function renderResumeText(content: ResumeContent): string {
  return [
    content.headline.trim(),
    "",
    SUMMARY_HEADING,
    content.summary.trim(),
    "",
    ...content.sections.flatMap((section) => [
      section.heading.toUpperCase(),
      ...section.bullets.map((bullet) => `• ${bullet.text.trim()}`),
      "",
    ]),
  ].join("\n").trim();
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
   */
  content.headline = lines[0];

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

  const content: ResumeContent = {
    headline: text(value.headline).trim(),
    summary: text(value.summary).trim(),
    sections,
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

/** Every evidence id the document still cites, de-duplicated. */
export function evidenceIdsIn(content: ResumeContent): string[] {
  return [...new Set(content.sections.flatMap((section) => section.bullets.flatMap((bullet) => bullet.evidenceIds)))];
}
