import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, RESUME_TEMPLATES, normaliseTemplate, resumeTemplate } from "@/lib/resume/templates";
import { resumeDocxBuffer } from "@/lib/resume/docx";
import { parseResumeContent } from "@/lib/resume/content";

/*
 * Every résumé builder on the market sells a gallery, and most of that gallery
 * is actively bad for the person using it: the pretty ones are two-column, and
 * a second column is the most common reason an applicant tracking system parses
 * a candidate into nonsense. Two is a deliberate number.
 */
describe("resume templates", () => {
  it("offers two, and both are real", () => {
    expect(RESUME_TEMPLATES).toHaveLength(2);
    for (const template of RESUME_TEMPLATES) {
      expect(template.name.trim()).not.toBe("");
      expect(template.description.trim()).not.toBe("");
      expect(template.docxFont.trim()).not.toBe("");
    }
    expect(new Set(RESUME_TEMPLATES.map((t) => t.id)).size).toBe(2);
  });

  it("falls back rather than rejecting an id it does not know", () => {
    expect(normaliseTemplate("modern")).toBe("modern");
    expect(normaliseTemplate("classic")).toBe("classic");
    /* A row written by a later version, or by nothing at all. */
    for (const value of ["executive", "", null, undefined, 7, {}]) {
      expect(normaliseTemplate(value)).toBe(DEFAULT_TEMPLATE);
    }
    expect(resumeTemplate("nonsense").id).toBe(DEFAULT_TEMPLATE);
  });

  it("defaults a stored document written before templates existed", () => {
    const parsed = parseResumeContent({
      headline: "A",
      summary: "B",
      sections: [{ heading: "WORK", bullets: [{ text: "Did a thing." }] }],
    });
    expect(parsed?.template).toBe(DEFAULT_TEMPLATE);
  });

  /*
   * Downloading must not quietly hand back a document that looks like a
   * different decision from the one made on screen.
   */
  it("carries the chosen font into the Word file", async () => {
    const base = {
      headline: "A name",
      summary: "A summary long enough to be worth setting.",
      sections: [{ id: "s0", heading: "WORK", bullets: [{ id: "s0b0", text: "Did a thing with 3 people.", evidenceIds: [], edited: false }] }],
    };
    const classic = (await resumeDocxBuffer({ ...base, template: "classic" })).toString("latin1");
    const modern = (await resumeDocxBuffer({ ...base, template: "modern" })).toString("latin1");
    expect(classic).not.toBe(modern);
  });
});
