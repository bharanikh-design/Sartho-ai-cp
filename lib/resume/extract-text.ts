/*
 * Turning an uploaded résumé into plain text.
 *
 * Kept deliberately separate from the route that calls it: this is the part
 * with the file-format edge cases, and it is worth being able to test it
 * without an HTTP request, a session or a model behind it.
 */

import { assertNoActiveContent, scanTextBytes, scanUploadBytes, UploadRejectedError, type UploadRejectionReason } from "@/lib/resume/scan-upload";
import {
  detectKind,
  MAX_UPLOAD_BYTES,
  type SupportedKind,
} from "@/lib/resume/upload";

export { detectKind, MAX_UPLOAD_BYTES, type SupportedKind } from "@/lib/resume/upload";

/*
 * A résumé that extracts to almost nothing is nearly always a scan — a photo
 * of a page inside a PDF wrapper, with no text layer to read. Failing loudly
 * is better than handing an empty string to a model, which would answer with
 * confident fiction rather than an error.
 */
export const MIN_USEFUL_CHARACTERS = 400;

/*
 * File size is not a useful proxy for model cost: a small compressed DOCX can
 * expand into millions of characters. A genuine résumé fits comfortably under
 * this ceiling; rejecting larger extracted documents prevents accidental huge
 * prompts and predictable provider context failures.
 */
export const MAX_RESUME_CHARACTERS = 120_000;

/*
 * A PDF with more pages than this is not a résumé, and every page is parser
 * time and memory spent before the character cap below can say so.
 */
export const MAX_PDF_PAGES = 100;

export class ResumeExtractionError extends Error {
  readonly userFacing = true;
  /*
   * Set when the file was refused by the content scan rather than merely
   * unreadable, so a route can record that a hostile upload was blocked
   * without recording anything of the upload itself.
   */
  readonly rejection: UploadRejectionReason | null;

  constructor(message: string, rejection: UploadRejectionReason | null = null) {
    super(message);
    this.rejection = rejection;
  }
}

/*
 * PDF text arrives with the line breaks of a layout engine rather than of a
 * document: hyphenated words split across lines, single newlines mid-sentence,
 * and runs of blank lines between blocks. Left alone it costs tokens and gives
 * the model spurious boundaries to reason about.
 *
 * For the model only. What is kept as the person's résumé is `raw` below,
 * untouched — this collapses the spacing, the blank lines and the tabs that
 * are the document's own layout, and a copy with those removed is not the
 * document they uploaded.
 */
export function normaliseWhitespace(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(bytes);
  if (document.numPages > MAX_PDF_PAGES) {
    throw new ResumeExtractionError(
      `That PDF has ${document.numPages} pages. A résumé is read up to ${MAX_PDF_PAGES} pages; please upload a shorter document.`,
    );
  }
  const { text } = await extractText(document, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

async function extractDocx(bytes: Uint8Array) {
  const mammoth = await import("mammoth");
  const buffer = Buffer.from(bytes);
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/*
 * Two texts come back, and they are for different readers.
 *
 * `raw` is the file's text exactly as the reader produced it — every space,
 * tab, blank line and line break, nothing trimmed and nothing shortened. It is
 * the record of what was uploaded, and it is what gets stored.
 *
 * `text` is the same document tidied for the model, which is charged by the
 * token and confused by a word broken across two lines. It is built in memory
 * and never stored.
 */
export type ExtractedResume = { raw: string; text: string; kind: SupportedKind };


export async function extractResumeText(
  file: { name: string; type: string | null; bytes: Uint8Array },
): Promise<ExtractedResume> {
  if (file.bytes.byteLength === 0) {
    throw new ResumeExtractionError("That file is empty.");
  }
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ResumeExtractionError(
      `That file is ${(file.bytes.byteLength / 1024 / 1024).toFixed(1)}MB. Please upload one under 8MB.`,
    );
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    throw new ResumeExtractionError("Sartho reads PDF, Word (.docx) and plain text résumés.");
  }

  /*
   * The bytes are inspected before any parser sees them: a file that is not
   * the format its name claims, or that carries scripts, macros, embedded
   * programs or an archive bomb, is refused here. For a text file this also
   * yields the decoded text, strictly as UTF-8.
   */
  let decodedText: string | null = null;
  try {
    if (kind === "text") decodedText = scanTextBytes(file.bytes);
    else scanUploadBytes(kind, file.bytes);
  } catch (caught) {
    if (caught instanceof UploadRejectedError) throw new ResumeExtractionError(caught.message, caught.reason);
    throw new ResumeExtractionError("Sartho could not read that file. It may be damaged.");
  }

  let raw: string;
  try {
    if (kind === "pdf") raw = await extractPdf(file.bytes);
    else if (kind === "docx") raw = await extractDocx(file.bytes);
    else raw = decodedText ?? "";
  } catch (caught) {
    if (caught instanceof ResumeExtractionError) throw caught;
    throw new ResumeExtractionError(
      "Sartho could not read that file. It may be password protected or damaged.",
    );
  }

  /*
   * The prose itself, whatever the container was. A PDF or Word file whose
   * text is a script payload is refused the same way a .txt one is, before it
   * is stored as a résumé or shown back to anybody.
   */
  try {
    assertNoActiveContent(raw);
  } catch (caught) {
    if (caught instanceof UploadRejectedError) throw new ResumeExtractionError(caught.message, caught.reason);
    throw caught;
  }

  const text = normaliseWhitespace(raw);

  if (text.length < MIN_USEFUL_CHARACTERS) {
    throw new ResumeExtractionError(
      kind === "pdf"
        ? "That PDF has almost no readable text — it looks like a scan or an image. Please upload a text-based PDF or a Word file."
        : "There is not enough text in that file to read as a résumé.",
    );
  }

  if (text.length > MAX_RESUME_CHARACTERS) {
    throw new ResumeExtractionError(
      "That document contains too much text to process safely as a résumé. Please upload a shorter résumé under 120,000 characters.",
    );
  }

  return { raw, text, kind };
}
