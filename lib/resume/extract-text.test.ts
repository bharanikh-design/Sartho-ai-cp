import { describe, expect, it } from "vitest";
import {
  detectKind,
  extractResumeText,
  MAX_UPLOAD_BYTES,
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
});
