import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from "docx";
import { EDUCATION_HEADING, EXPERIENCE_HEADING, SKILLS_HEADING, contactLine, headlineOf, roleDates, roleWhere, type ResumeContent } from "@/lib/resume/content";
import { resumeTemplate, type ResumeDocxStyle } from "@/lib/resume/templates";

/*
 * The résumé as a Word document an applicant tracking system can actually read.
 *
 * This is only possible because the structure is kept. Building a .docx from
 * the text column would mean guessing which lines were headings and which were
 * bullets, and getting that wrong produces exactly the file people complain
 * about: one where every line is a paragraph and the parser finds no sections.
 *
 * Three deliberate constraints, all of them about the machine that reads this
 * before a person does:
 *
 *   - Real heading styles, not bold text that looks like a heading. A parser
 *     looks for the style, not the weight.
 *   - Real bullet lists, not a hyphen typed at the start of a line.
 *   - One column, no tables, no text boxes, no headers or footers. Multi-column
 *     layout is the most common reason a candidate is parsed into nonsense, and
 *     contact details in a header are frequently dropped entirely.
 *
 * The template decides the font, the size and weight of the name, whether it
 * is centred, and how section headings are set. Only the font used to travel,
 * so somebody who chose a template on screen and downloaded .docx received the
 * same document in a different typeface — the choice discarded at the one
 * moment it mattered, since the Word file is what actually gets sent.
 *
 * Every font named is metrically ordinary and present on every machine. A font
 * that has to be substituted changes the pagination without warning, which is
 * how a one-page résumé becomes two on somebody else's computer.
 */

export function buildResumeDocx(content: ResumeContent): Document {
  const style = resumeTemplate(content.template).docx;
  const children: Paragraph[] = [];

  const align = style.nameAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

  if (content.name.trim()) {
    children.push(new Paragraph({
      alignment: align,
      spacing: { after: content.targetRole.trim() ? 40 : 120 },
      children: [new TextRun({ text: content.name.trim(), bold: true, size: style.nameSize, font: style.font })],
    }));
  }

  if (content.targetRole.trim()) {
    children.push(new Paragraph({
      alignment: align,
      spacing: { after: 80 },
      children: [new TextRun({ text: content.targetRole.trim(), size: style.headingSize, font: style.font })],
    }));
  }

  /*
   * The contact line is a paragraph, not a header. Contact details placed in a
   * Word header are frequently dropped outright by a parser — which is how
   * somebody's phone number goes missing from the one document whose purpose
   * is to make them reachable.
   */
  const contact = contactLine(content.contact);
  if (contact) {
    children.push(new Paragraph({
      alignment: align,
      spacing: { after: 160 },
      children: [new TextRun({ text: contact, size: style.bodySize, font: style.font })],
    }));
  }

  if (content.summary.trim()) {
    children.push(sectionHeading("Professional Summary", style));
    children.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: content.summary.trim(), size: style.bodySize, font: style.font })],
    }));
  }

  if (content.roles.length) {
    children.push(sectionHeading(EXPERIENCE_HEADING, style));
    for (const role of content.roles) {
      const where = roleWhere(role);
      const dates = roleDates(role);
      /*
       * Title on the left, dates pushed to the right margin by a single right
       * tab stop. This is what a Word résumé looks like, and a tab stop is the
       * one way to get it that is not a table: a table is read column by column
       * and is the most common reason a parser attributes somebody's dates to
       * the wrong job.
       */
      if (role.title.trim() || where || dates) {
        children.push(new Paragraph({
          spacing: { before: 160, after: 20 },
          tabStops: dates ? [{ type: TabStopType.RIGHT, position: 9020 }] : undefined,
          children: [
            new TextRun({ text: role.title.trim(), bold: true, size: style.bodySize, font: style.font }),
            ...(where
              ? [new TextRun({ text: `${role.title.trim() ? ", " : ""}${where}`, size: style.bodySize, font: style.font })]
              : []),
            ...(dates
              ? [new TextRun({ text: `\t${dates}`, italics: true, size: style.bodySize, font: style.font })]
              : []),
          ],
        }));
      }
      for (const bullet of role.bullets.filter((item) => item.text.trim())) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: [new TextRun({ text: bullet.text.trim(), size: style.bodySize, font: style.font })],
        }));
      }
    }
  }

  for (const section of content.sections) {
    const bullets = section.bullets.filter((bullet) => bullet.text.trim());
    /* A heading with nothing under it reads as a section the person left empty. */
    if (!bullets.length) continue;

    if (section.heading.trim()) children.push(sectionHeading(section.heading.trim(), style));
    for (const bullet of bullets) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text: bullet.text.trim(), size: style.bodySize, font: style.font })],
      }));
    }
  }

  if (content.skills.length) {
    children.push(sectionHeading(SKILLS_HEADING, style));
    children.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: content.skills.join(" · "), size: style.bodySize, font: style.font })],
    }));
  }

  if (content.education.length) {
    children.push(sectionHeading(EDUCATION_HEADING, style));
    for (const entry of content.education) {
      const left = [entry.qualification.trim(), entry.institution.trim()].filter(Boolean).join(", ");
      if (!left && !entry.year.trim()) continue;
      children.push(new Paragraph({
        spacing: { after: 60 },
        tabStops: entry.year.trim() ? [{ type: TabStopType.RIGHT, position: 9020 }] : undefined,
        children: [
          new TextRun({ text: left, size: style.bodySize, font: style.font }),
          ...(entry.year.trim()
            ? [new TextRun({ text: `\t${entry.year.trim()}`, italics: true, size: style.bodySize, font: style.font })]
            : []),
        ],
      }));
    }
  }

  return new Document({
    creator: "Sartho",
    description: "Résumé generated by Sartho from approved career evidence.",
    title: headlineOf(content) || "Résumé",
    styles: {
      default: {
        document: { run: { font: style.font, size: style.bodySize } },
      },
    },
    sections: [{
      properties: {
        page: {
          /* Twips: 1 inch margins all round, which every reviewer expects. */
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });
}

/*
 * A real Heading 1, not bold text of the same size.
 *
 * The distinction is invisible on screen and decisive to a parser: a style is
 * machine-readable structure, a bold run is a formatting accident that happens
 * to look like structure.
 *
 * The rule under it is a paragraph border, not a table and not a drawn line —
 * so the heading remains one paragraph carrying one style, and the parser sees
 * exactly what it saw before.
 */
function sectionHeading(text: string, style: ResumeDocxStyle): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 100 },
    border: style.headingRule
      ? { bottom: { style: BorderStyle.SINGLE, size: 4, space: 2, color: "000000" } }
      : undefined,
    children: [new TextRun({
      text: style.headingUpper ? text.toUpperCase() : text,
      bold: true,
      size: style.headingSize,
      font: style.font,
    })],
  });
}

/** The document as bytes, ready to send. */
export function resumeDocxBuffer(content: ResumeContent): Promise<Buffer> {
  return Packer.toBuffer(buildResumeDocx(content));
}

/*
 * A filename somebody can find again in their downloads folder six weeks later.
 *
 * "resume.docx" is what every other tool produces, and a person applying for
 * fifteen roles ends up with resume(7).docx and no idea which one it is.
 */
export function resumeFileName(versionName: string, employer: string | null, extension: string): string {
  const parts = [versionName, employer].filter((part): part is string => Boolean(part?.trim()));
  const stem = parts.join(" - ")
    .normalize("NFKD")
    /* Windows and macOS both refuse some of these outright. */
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${stem || "Resume"}.${extension}`;
}
