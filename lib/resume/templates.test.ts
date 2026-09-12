import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, RESUME_TEMPLATES, RESUME_TEMPLATE_IDS, normaliseTemplate, resumeTemplate } from "@/lib/resume/templates";
import { resumeDocxBuffer } from "@/lib/resume/docx";
import { parseResumeContent } from "@/lib/resume/content";

/*
 * The gallery every résumé builder sells is mostly two-column, and a second
 * column is the most common reason an applicant tracking system parses a
 * candidate into nonsense.
 *
 * The answer here is not to ban design. The two files a person downloads are
 * for two different readers: the Word file goes to the parser and is single
 * column on every template without exception, and the PDF goes to a human and
 * can be as designed as it likes. `atsSafe` says which is which, out loud.
 *
 * These tests were pinned to a count of seven, which is a number rather than a
 * property — it failed the moment a template was added, which is the one thing
 * a template list is supposed to allow.
 */
describe("resume templates", () => {
  it("offers a real choice, and every one of them is finished", () => {
    expect(RESUME_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const template of RESUME_TEMPLATES) {
      expect(template.name.trim()).not.toBe("");
      expect(template.description.trim()).not.toBe("");
      /* Nobody picks a template from its name alone. */
      expect(template.bestFor.trim().length).toBeGreaterThan(20);
      expect(template.docx.font.trim()).not.toBe("");
      expect(template.docx.bodySize).toBeGreaterThan(0);
      expect(template.docx.nameSize).toBeGreaterThan(template.docx.bodySize);
    }
    expect(new Set(RESUME_TEMPLATES.map((t) => t.id)).size).toBe(RESUME_TEMPLATES.length);
  });

  /*
   * The promise the whole model rests on. Whatever the PDF does, the file that
   * reaches an applicant tracking system is safe — so choosing a sidebar can
   * never quietly cost somebody an application.
   */
  it("keeps a Word file for every template, sidebar ones included", () => {
    for (const template of RESUME_TEMPLATES) {
      expect(template.docx).toBeTruthy();
      expect(template.docx.font.trim()).not.toBe("");
    }
  });

  it("marks a sidebar template as the one the parser would struggle with", () => {
    for (const template of RESUME_TEMPLATES) {
      if (template.pdf.layout === "sidebar") expect(template.atsSafe).toBe(false);
      else expect(template.atsSafe).toBe(true);
    }
  });

  /* A choice with nothing safe in it is not a choice. */
  it("offers both kinds", () => {
    expect(RESUME_TEMPLATES.some((template) => template.atsSafe)).toBe(true);
    expect(RESUME_TEMPLATES.some((template) => !template.atsSafe)).toBe(true);
  });

  /*
   * Every token the renderer reads has to be present and sane, because a
   * missing one does not throw — it draws a page that is subtly wrong and
   * nobody notices until it has been sent.
   */
  it("gives the renderer everything it reads", () => {
    for (const template of RESUME_TEMPLATES) {
      const { pdf } = template;
      expect(["Helvetica", "Times-Roman"]).toContain(pdf.font);
      expect(["single", "sidebar"]).toContain(pdf.layout);
      expect(["rule", "doubleRule", "bar", "edge", "plain"]).toContain(pdf.heading);
      expect(pdf.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(pdf.ink).toMatch(/^#[0-9a-f]{6}$/i);
      expect(pdf.muted).toMatch(/^#[0-9a-f]{6}$/i);
      expect(pdf.bodySize).toBeGreaterThan(6);
      expect(pdf.nameSize).toBeGreaterThan(pdf.bodySize);
      expect(pdf.lineHeight).toBeGreaterThan(1);

      /* A sidebar has to say how wide it is and what colour its text takes. */
      if (pdf.layout === "sidebar") {
        expect(pdf.sidebarWidth ?? 0).toBeGreaterThan(120);
        expect(pdf.sidebarInk).toMatch(/^#[0-9a-f]{6}$/i);
        expect(pdf.sidebarMuted).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  /*
   * The failure this rewrite exists for. Seven templates were described in
   * prose and the renderer read one field of them — the font — so choosing a
   * template changed the typeface of the thing a person sends and nothing else.
   * Two templates that differ only in font are one template.
   */
  it("does not describe two templates that would draw the same page", () => {
    const shapes = RESUME_TEMPLATES.map((template) => {
      const { font, layout, heading, accent, nameAlign, nameCaps } = template.pdf;
      return [font, layout, heading, accent, nameAlign, nameCaps].join("|");
    });
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("falls back rather than rejecting an id it does not know", () => {
    for (const id of RESUME_TEMPLATE_IDS) expect(normaliseTemplate(id)).toBe(id);
    for (const value of ["sidebar", "", null, undefined, 7, {}]) {
      expect(normaliseTemplate(value)).toBe(DEFAULT_TEMPLATE);
    }
    expect(resumeTemplate("nonsense").id).toBe(DEFAULT_TEMPLATE);
  });

  it("defaults a stored document written before templates existed", () => {
    const parsed = parseResumeContent({
      name: "A",
      summary: "B",
      sections: [{ heading: "WORK", bullets: [{ text: "Did a thing." }] }],
    });
    expect(parsed?.template).toBe(DEFAULT_TEMPLATE);
  });

  /*
   * The bug that made the list and the schema two things to remember. The
   * schema spelled its own enum out, so a template added here saved happily and
   * came back as Classic on reload — no error anywhere, because `.catch()` was
   * doing exactly what it was asked to.
   */
  it("accepts every template it offers when a document is saved", () => {
    for (const id of RESUME_TEMPLATE_IDS) {
      const parsed = parseResumeContent({
        name: "A",
        summary: "B",
        sections: [{ heading: "WORK", bullets: [{ text: "Did a thing." }] }],
        template: id,
      });
      expect(parsed?.template).toBe(id);
    }
  });
});

/*
 * Downloading must not quietly hand back a document that looks like a different
 * decision from the one made on screen — and the Word file is the one that
 * actually gets sent.
 */
describe("the Word file follows the template", () => {
  const base = {
    name: "A name",
    targetRole: "Business Analyst",
    contact: { email: "a@example.com", phone: "", location: "Sydney", linkedin: "", website: "" },
    roles: [],
    skills: [],
    education: [],
    summary: "A summary long enough to be worth setting.",
    sections: [{ id: "s0", heading: "Work", bullets: [{ id: "s0b0", text: "Did a thing with 3 people.", evidenceIds: [], edited: false }] }],
  };
  /*
   * A .docx is a zip, so the document XML has to be inflated before anything
   * can be asserted about it. Reading the packed bytes as a string finds
   * nothing and passes nothing — every "contains" check would be vacuously
   * false, and a test that can only fail is no better than no test.
   */
  const build = async (template: (typeof RESUME_TEMPLATE_IDS)[number]) => {
    const zip = await JSZip.loadAsync(await resumeDocxBuffer({ ...base, template }));
    return zip.file("word/document.xml")!.async("string");
  };

  it("produces a different document for every template", async () => {
    const files = await Promise.all(RESUME_TEMPLATE_IDS.map(build));
    expect(new Set(files).size).toBe(RESUME_TEMPLATE_IDS.length);
  });

  it("carries the chosen font", async () => {
    expect(await build("executive")).toContain("Georgia");
    expect(await build("impact")).toContain("Arial");
    expect(await build("editorial")).toContain("Cambria");
    expect(await build("classic")).toContain("Times New Roman");
  });

  /*
   * Only the font used to travel, so every download was the same document in a
   * different typeface. Alignment and size are what make a Word template look
   * like a choice, and none of it is anything a parser reads.
   */
  it("centres the name only where the template says so", async () => {
    expect(await build("classic")).toContain('w:val="center"');
    expect(await build("executive")).toContain('w:val="center"');
    /* Impact and Modern set the name hard left. */
    const impact = await build("impact");
    expect(impact).not.toContain('w:val="center"');
  });

  it("keeps the section heading a real Heading 1 in all of them", async () => {
    for (const id of RESUME_TEMPLATE_IDS) {
      /* A style is machine-readable structure; a bold run only looks like one. */
      expect(await build(id)).toContain("Heading1");
    }
  });

  /*
   * Editorial is the one template whose headings are set in sentence case. If
   * the upper-casing were unconditional the difference would vanish in the file
   * while remaining visible on screen, which is the worst of both.
   */
  it("upper-cases headings only where the template asks", async () => {
    expect(await build("classic")).toContain("WORK");
    expect(await build("editorial")).not.toContain("WORK");
  });
});
