import { describe, expect, it } from "vitest";
import { resumeDocxBuffer, resumeFileName } from "@/lib/resume/docx";
import type { ResumeContent } from "@/lib/resume/content";

const document: ResumeContent = {
  headline: "Bharani Kumar K — Business Analyst",
  summary: "Consulting and analytical professional with delivery experience.",
  sections: [
    {
      id: "s0",
      heading: "Client consulting",
      bullets: [
        { id: "s0b0", text: "Delivered an implementation roadmap for 3 workstreams.", evidenceIds: ["e1"], edited: false },
        { id: "s0b1", text: "Worked in a team of 3 on a live business case.", evidenceIds: ["e2"], edited: false },
      ],
    },
    /* A heading with nothing under it is a section somebody left empty. */
    { id: "s1", heading: "Empty section", bullets: [] },
  ],
};

/*
 * A .docx is a zip of XML, so the bytes can be read back without Word. These
 * assertions are about the things an applicant tracking system looks for, not
 * about how the file looks — a résumé that reads beautifully and parses into
 * nonsense has failed at the only step that happens before a person sees it.
 */
async function xmlOf(content: ResumeContent): Promise<string> {
  const buffer = await resumeDocxBuffer(content);
  /* The document body is stored deflated; the readable check is on the whole archive. */
  return buffer.toString("latin1");
}

describe("buildResumeDocx", () => {
  it("produces a real Word archive", async () => {
    const buffer = await resumeDocxBuffer(document);
    /* Every .docx begins with the zip local file header. */
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(2_000);
  });

  it("names the parts Word and every parser expect", async () => {
    const archive = await xmlOf(document);
    expect(archive).toContain("word/document.xml");
    expect(archive).toContain("[Content_Types].xml");
    /* Bullets are a real numbering definition, not a hyphen typed at the start. */
    expect(archive).toContain("word/numbering.xml");
    expect(archive).toContain("word/styles.xml");
  });

  it("survives a document with nothing in it rather than throwing", async () => {
    const buffer = await resumeDocxBuffer({ headline: "", summary: "", sections: [] });
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("does not fall over on a section whose bullets were all removed", async () => {
    const buffer = await resumeDocxBuffer({
      headline: "A",
      summary: "B",
      sections: [{ id: "s0", heading: "Gone", bullets: [] }],
    });
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });
});

/*
 * "resume.docx" is what every other tool produces, and somebody applying for
 * fifteen roles ends up with resume(7).docx and no idea which is which.
 */
describe("resumeFileName", () => {
  it("names the file after the role and the employer", () => {
    expect(resumeFileName("SAM Consultant", "Datacom", "docx")).toBe("SAM Consultant - Datacom.docx");
    expect(resumeFileName("SAM Consultant", null, "pdf")).toBe("SAM Consultant.pdf");
  });

  it("strips the characters Windows and macOS refuse", () => {
    expect(resumeFileName('Analyst: "Data"/Risk*', "A<B>C|D", "docx")).toBe("Analyst Data Risk - A B C D.docx");
  });

  it("falls back rather than producing a file called nothing", () => {
    expect(resumeFileName("", null, "docx")).toBe("Resume.docx");
    expect(resumeFileName("///", null, "pdf")).toBe("Resume.pdf");
  });

  it("keeps the name short enough for any filesystem", () => {
    const name = resumeFileName("x".repeat(200), "y".repeat(200), "docx");
    expect(name.length).toBeLessThanOrEqual(85);
    expect(name.endsWith(".docx")).toBe(true);
  });
});
