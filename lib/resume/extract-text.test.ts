import { describe, expect, it } from "vitest";
import {
  detectKind,
  extractResumeText,
  MAX_UPLOAD_BYTES,
  MAX_RESUME_CHARACTERS,
  MIN_USEFUL_CHARACTERS,
  normaliseWhitespace,
  ResumeExtractionError,
} from "./extract-text";

const encoder = new TextEncoder();

function resumeSizedText(seed: string) {
  return seed.repeat(Math.ceil((MIN_USEFUL_CHARACTERS + 100) / seed.length));
}

describe("detectKind", () => {
  it("recognises a format from its media type", () => {
    expect(detectKind("cv", "application/pdf")).toBe("pdf");
    expect(detectKind("cv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(detectKind("cv", "text/plain")).toBe("text");
  });

  it("falls back to the extension when the browser sends nothing useful", () => {
    expect(detectKind("resume.PDF", null)).toBe("pdf");
    expect(detectKind("resume.docx", "application/octet-stream")).toBe("docx");
    expect(detectKind("notes.md", "")).toBe("text");
  });

  it("refuses formats it cannot read", () => {
    expect(detectKind("resume.doc", "application/msword")).toBeNull();
    expect(detectKind("resume.pages", null)).toBeNull();
    expect(detectKind("photo.png", "image/png")).toBeNull();
  });
});

describe("normaliseWhitespace", () => {
  it("rejoins a word a PDF split across two lines", () => {
    expect(normaliseWhitespace("infra-\nstructure")).toBe("infrastructure");
  });

  it("collapses runs of blank lines and stray spacing", () => {
    expect(normaliseWhitespace("Role\n\n\n\nEmployer")).toBe("Role\n\nEmployer");
    expect(normaliseWhitespace("a   b\t\tc")).toBe("a b c");
  });

  it("replaces non-breaking spaces, which PDFs are full of", () => {
    expect(normaliseWhitespace("Head of EUC")).toBe("Head of EUC");
  });
});

describe("extractResumeText", () => {
  it("reads a plain text résumé", async () => {
    const text = resumeSizedText("Head of End User Computing at Barclays. ");
    const { text: out, kind } = await extractResumeText({
      name: "cv.txt",
      type: "text/plain",
      bytes: encoder.encode(text),
    });
    expect(kind).toBe("text");
    expect(out).toContain("End User Computing");
  });

  it("rejects an empty file", async () => {
    await expect(
      extractResumeText({ name: "cv.txt", type: "text/plain", bytes: new Uint8Array() }),
    ).rejects.toBeInstanceOf(ResumeExtractionError);
  });

  it("rejects a file over the size limit before trying to parse it", async () => {
    await expect(
      extractResumeText({
        name: "cv.pdf",
        type: "application/pdf",
        bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1),
      }),
    ).rejects.toThrow(/under 8MB/);
  });

  it("rejects a format it cannot read", async () => {
    await expect(
      extractResumeText({
        name: "cv.doc",
        type: "application/msword",
        bytes: encoder.encode(resumeSizedText("x")),
      }),
    ).rejects.toThrow(/PDF, Word/);
  });

  it("refuses a document with too little text to be a résumé", async () => {
    await expect(
      extractResumeText({ name: "cv.txt", type: "text/plain", bytes: encoder.encode("Hi") }),
    ).rejects.toThrow(/not enough text/);
  });

  it("refuses extracted text large enough to create an unsafe model request", async () => {
    const oversized = "Senior technology leader. ".repeat(
      Math.ceil((MAX_RESUME_CHARACTERS + 1) / 26),
    );

    await expect(
      extractResumeText({
        name: "cv.txt",
        type: "text/plain",
        bytes: encoder.encode(oversized),
      }),
    ).rejects.toThrow(/too much text/);
  });
});

/*
 * The text kept as the person's résumé is the file's text as read, untouched.
 *
 * Normalisation is for the model. It collapses the spacing, blank lines and
 * tabs that are the document's own layout, and rejoins words a PDF split with
 * a hyphen — and a copy with those changes is not the document that was
 * uploaded. `raw` has to survive every one of them.
 */
describe("extractResumeText keeps the document as read", () => {
  const asUploaded = [
    "BHARANI KUMAR H",
    "Head of End User Computing  ·  London, UK  ·  +44 7000 000000",
    "",
    "PROFESSIONAL SUMMARY",
    "Technology leader with twenty years across service transformation, infra-",
    "structure modernisation and end user computing at global banks.",
    "",
    "",
    "",
    "EXPERIENCE",
    "Barclays — Head of EUC Engineering\t\t2019 – Present",
    "• Cut major incident volume by 40% across a 60,000 device estate.",
    "• Migrated 42,000 endpoints to Windows 11 across eleven countries.",
    "• Ran a £4m managed service contract through to renewal.",
    "",
    "HSBC — Service Transition Lead\t\t2015 – 2019",
    "• Consolidated four regional service desks into one follow-the-sun operation.",
    "• Supported 90,000 users across a global estate every day.",
    "",
    "SKILLS",
    "ITSM   ·   Endpoint   ·   Intune   ·   ServiceNow   ·   Vendor management",
    "",
  ];

  it("keeps a plain text résumé byte for byte, and tidies only the model's copy", async () => {
    const original = asUploaded.join("\n");
    const { raw, text } = await extractResumeText({
      name: "cv.txt",
      type: "text/plain",
      bytes: encoder.encode(original),
    });

    expect(raw).toBe(original);
    expect(raw).not.toBe(text);
    expect(text).toContain("infrastructure modernisation");
    expect(text).not.toContain("\t");
  });

  it("keeps every paragraph of a Word file, blank lines and tabs included", async () => {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const document = new Document({
      sections: [{ children: asUploaded.map((line) => new Paragraph({ children: [new TextRun(line)] })) }],
    });
    const bytes = new Uint8Array(await Packer.toBuffer(document));

    const mammoth = await import("mammoth");
    const readerOutput = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;

    const { raw, text, kind } = await extractResumeText({ name: "cv.docx", type: null, bytes });

    expect(kind).toBe("docx");
    expect(raw).toBe(readerOutput);
    for (const line of asUploaded.filter(Boolean)) expect(raw).toContain(line);
    /* The tabs and the run of blank lines survive in raw and are gone from the model's copy. */
    expect(raw).toContain("\t\t2019");
    expect(text).not.toContain("\t");
    expect(raw.length).toBeGreaterThan(text.length);
  });

  it("keeps a PDF's own line breaks, hyphenation included", async () => {
    const React = await import("react");
    const { Document, Page, Text, renderToBuffer } = await import("@react-pdf/renderer");
    const h = React.createElement;
    const rendered = await renderToBuffer(
      h(Document, null, h(Page, { size: "A4", style: { padding: 40, fontSize: 10 } },
        ...asUploaded.map((line, index) => h(Text, { key: index }, line === "" ? " " : line)))) as never,
    );
    const bytes = new Uint8Array(rendered.buffer, rendered.byteOffset, rendered.byteLength);

    const { extractText, getDocumentProxy } = await import("unpdf");
    const readerOutput = (await extractText(await getDocumentProxy(bytes), { mergePages: true })).text;

    const { raw, text, kind } = await extractResumeText({ name: "cv.pdf", type: "application/pdf", bytes });

    expect(kind).toBe("pdf");
    expect(raw).toBe(readerOutput);
    expect(raw).toContain("infra-\nstructure");
    expect(text).toContain("infrastructure modernisation");
    expect(text).not.toContain("infra-\nstructure");
  });
});
