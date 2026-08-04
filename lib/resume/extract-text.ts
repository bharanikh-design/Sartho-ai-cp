/*
 * Turning an uploaded résumé into plain text.
 *
 * Kept deliberately separate from the route that calls it: this is the part
 * with the file-format edge cases, and it is worth being able to test it
 * without an HTTP request, a session or a model behind it.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/*
 * A résumé that extracts to almost nothing is nearly always a scan — a photo
 * of a page inside a PDF wrapper, with no text layer to read. Failing loudly
 * is better than handing an empty string to a model, which would answer with
 * confident fiction rather than an error.
 */
export const MIN_USEFUL_CHARACTERS = 400;

export type SupportedKind = "pdf" | "docx" | "text";

export class ResumeExtractionError extends Error {
  readonly userFacing = true;
}

export function detectKind(fileName: string, mimeType: string | null): SupportedKind | null {
  const name = fileName.toLowerCase();
  const type = (mimeType ?? "").toLowerCase();

  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) return "text";

  return null;
}

/*
 * PDF text arrives with the line breaks of a layout engine rather than of a
 * document: hyphenated words split across lines, single newlines mid-sentence,
 * and runs of blank lines between blocks. Left alone it costs tokens and gives
 * the model spurious boundaries to reason about.
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
  const { text } = await extractText(document, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

async function extractDocx(bytes: Uint8Array) {
  const mammoth = await import("mammoth");
  const buffer = Buffer.from(bytes);
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

export async function extractResumeText(
  file: { name: string; type: string | null; bytes: Uint8Array },
): Promise<{ text: string; kind: SupportedKind }> {
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

  let raw: string;
  try {
    if (kind === "pdf") raw = await extractPdf(file.bytes);
    else if (kind === "docx") raw = await extractDocx(file.bytes);
    else raw = new TextDecoder().decode(file.bytes);
  } catch {
    throw new ResumeExtractionError(
      "Sartho could not read that file. It may be password protected or damaged.",
    );
  }

  const text = normaliseWhitespace(raw);

  if (text.length < MIN_USEFUL_CHARACTERS) {
    throw new ResumeExtractionError(
      kind === "pdf"
        ? "That PDF has almost no readable text — it looks like a scan or an image. Please upload a text-based PDF or a Word file."
        : "There is not enough text in that file to read as a résumé.",
    );
  }

  return { text, kind };
}
