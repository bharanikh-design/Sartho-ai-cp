import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, RESUME_TEMPLATES, RESUME_TEMPLATE_IDS, normaliseTemplate, resumeTemplate } from "@/lib/resume/templates";
import { resumeDocxBuffer } from "@/lib/resume/docx";
import { parseResumeContent } from "@/lib/resume/content";

/*
 * The gallery every résumé builder sells is mostly two-column, and a second
 * column is the most common reason an applicant tracking system parses a
 * candidate into nonsense. That constraint is not the same as having no design:
 * the weight of the name, whether a heading sits on a rule or against a bar,
 * and how much air a section gets all happen inside one column.
 */
describe("resume templates", () => {
  it("offers seven, and every one is real", () => {
    expect(RESUME_TEMPLATES).toHaveLength(7);
    for (const template of RESUME_TEMPLATES) {
      expect(template.name.trim()).not.toBe("");
      expect(template.description.trim()).not.toBe("");
      /* Nobody picks a template from its name alone. */
      expect(template.bestFor.trim().length).toBeGreaterThan(20);
      expect(template.docx.font.trim()).not.toBe("");
      expect(template.docx.bodySize).toBeGreaterThan(0);
      expect(template.docx.nameSize).toBeGreaterThan(template.docx.bodySize);
    }
    expect(new Set(RESUME_TEMPLATES.map((t) => t.id)).size).toBe(7);
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
