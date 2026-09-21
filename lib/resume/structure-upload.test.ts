import { describe, expect, it } from "vitest";
import { renderResumeText } from "./content";
import { contentFromStructuredUpload, placedWordShare, STRUCTURE_UPLOAD_RULES, structuredUploadOutput } from "./structure-upload";

/*
 * Laying an upload out must copy, never write. These tests hold the shape:
 * every line the model returns lands on the document unchanged, every bullet
 * is unbacked, and the document remembers which file it came from.
 */

const RAW = [
  "BHARANI KUMAR H",
  "Head of End User Computing",
  "London, UK · +44 7000 000000 · bharani@example.com",
  "",
  "PROFESSIONAL SUMMARY",
  "Technology leader with twenty years across service transformation.",
  "",
  "EXPERIENCE",
  "Barclays — Head of EUC Engineering\t\t2019 – Present",
  "• Cut major incident volume by 40% across a 60,000 device estate.",
  "• Migrated 42,000 endpoints to Windows 11 across eleven countries.",
  "",
  "EDUCATION",
  "BSc Computer Science, University of Madras, 2004",
  "",
  "SKILLS",
  "ITSM · Endpoint · Intune",
].join("\n");

const MODEL_OUTPUT = {
  name: "BHARANI KUMAR H",
  targetRole: "Head of End User Computing",
  contact: { email: "bharani@example.com", phone: "+44 7000 000000", location: "London, UK", linkedin: "", website: "" },
  summary: "Technology leader with twenty years across service transformation.",
  roles: [{
    title: "Head of EUC Engineering", employer: "Barclays", location: "", start: "2019", end: "Present", current: true,
    bullets: [
      "Cut major incident volume by 40% across a 60,000 device estate.",
      "Migrated 42,000 endpoints to Windows 11 across eleven countries.",
    ],
  }],
  sections: [],
  skills: ["ITSM", "Endpoint", "Intune"],
  education: [{ qualification: "BSc Computer Science", institution: "University of Madras", year: "2004" }],
};

const IMPORT_ID = "0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";

describe("contentFromStructuredUpload", () => {
  it("copies every line into the document unchanged, unbacked, and remembers the file", () => {
    const parsed = structuredUploadOutput.parse(MODEL_OUTPUT);
    const content = contentFromStructuredUpload(parsed, { importId: IMPORT_ID, fallbackEmail: "signin@example.com" });

    expect(content.sourceImportId).toBe(IMPORT_ID);
    expect(content.name).toBe("BHARANI KUMAR H");
    expect(content.contact.email).toBe("bharani@example.com");
    expect(content.roles).toHaveLength(1);
    expect(content.roles[0].bullets.map((bullet) => bullet.text)).toEqual(MODEL_OUTPUT.roles[0].bullets);
    for (const bullet of content.roles[0].bullets) {
      expect(bullet.evidenceIds).toEqual([]);
      expect(bullet.edited).toBe(false);
    }
    expect(content.skills).toEqual(["ITSM", "Endpoint", "Intune"]);
    expect(content.education[0]).toMatchObject({ qualification: "BSc Computer Science", year: "2004" });
    /* Renders, so the editor and the ATS reader have text to work on. */
    expect(renderResumeText(content)).toContain("Cut major incident volume by 40%");
  });

  it("falls back to the sign-in email only when the résumé states none", () => {
    const parsed = structuredUploadOutput.parse({ ...MODEL_OUTPUT, contact: { ...MODEL_OUTPUT.contact, email: "" } });
    const content = contentFromStructuredUpload(parsed, { importId: IMPORT_ID, fallbackEmail: "signin@example.com" });
    expect(content.contact.email).toBe("signin@example.com");
  });

  it("drops empty roles, sections and bullets rather than rendering blanks", () => {
    const parsed = structuredUploadOutput.parse({
      ...MODEL_OUTPUT,
      roles: [...MODEL_OUTPUT.roles, { title: "", employer: "", location: "", start: "", end: "", current: false, bullets: ["", "  "] }],
      sections: [{ heading: "", bullets: [] }, { heading: "Awards", bullets: ["Employee of the year 2021"] }],
    });
    const content = contentFromStructuredUpload(parsed, { importId: IMPORT_ID });
    expect(content.roles).toHaveLength(1);
    expect(content.sections).toEqual([{ id: "s1", heading: "Awards", bullets: [{ id: "s1b0", text: "Employee of the year 2021", evidenceIds: [], edited: false }] }]);
  });

  it("reports how much of the résumé was placed, in words", () => {
    const parsed = structuredUploadOutput.parse(MODEL_OUTPUT);
    const content = contentFromStructuredUpload(parsed, { importId: IMPORT_ID });
    const share = placedWordShare(RAW, content);
    expect(share.total).toBeGreaterThan(30);
    /* Section headings became structure; every other word of the file is on the page. */
    const headings = ["professional", "summary", "experience", "education", "skills"];
    expect(share.total - share.placed).toBeLessThanOrEqual(headings.length);

    const half = contentFromStructuredUpload(structuredUploadOutput.parse({ ...MODEL_OUTPUT, roles: [] }), { importId: IMPORT_ID });
    expect(placedWordShare(RAW, half).placed).toBeLessThan(share.placed);
  });

  it("tells the model to copy and never to write", () => {
    expect(STRUCTURE_UPLOAD_RULES).toContain("word for word");
    expect(STRUCTURE_UPLOAD_RULES).toContain("Nothing may be left out");
    expect(STRUCTURE_UPLOAD_RULES).not.toMatch(/improve|strengthen|rewrite/i);
  });
});
