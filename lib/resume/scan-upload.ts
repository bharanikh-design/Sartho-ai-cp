import { inflateRawSync } from "node:zlib";
import type { SupportedKind } from "@/lib/resume/upload";

/*
 * Is this file really what it claims to be, and does it carry anything that
 * could run?
 *
 * A résumé arrives as bytes plus a name plus whatever media type the browser,
 * Google Drive or the bucket put on it. None of those three is evidence: a
 * name is typed, a media type is declared, and the bucket only checks the
 * declaration. This module looks at the bytes.
 *
 * It is deliberately a refusal list rather than a virus scanner. The product
 * reads three formats, and each has a small, well-known set of features that a
 * résumé never needs and an attacker always does: JavaScript and launch
 * actions in a PDF, macros and OLE objects in a Word file, script tags in a
 * text file, and archives that expand to many times their size. A file with
 * any of those is not read, not stored and, where it was already in the
 * bucket, deleted by the caller.
 *
 * Text is scanned in two places. The bytes first, so a file that is not what
 * it says it is never reaches a parser. Then the extracted text, so a PDF or
 * Word document whose prose is a script payload is refused too, before it is
 * kept as somebody's résumé or shown back to anybody.
 */

export class UploadRejectedError extends Error {
  readonly userFacing = true;
  constructor(message: string, readonly reason: UploadRejectionReason) {
    super(message);
  }
}

export type UploadRejectionReason =
  | "not_pdf"
  | "pdf_active_content"
  | "not_docx"
  | "docx_macro"
  | "docx_embedded_object"
  | "docx_external_template"
  | "docx_field_code"
  | "docx_zip_bomb"
  | "docx_unsafe_entry"
  | "text_binary"
  | "text_active_content"
  | "extracted_active_content";

const PDF_MAGIC = "%PDF-";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

/* How far into the file a PDF header may sit: the spec allows leading junk. */
const PDF_HEADER_WINDOW = 1024;

/*
 * Name tokens a résumé PDF never carries. Each one is a way to make a reader
 * execute something or reach outside the document: script, launched
 * programs, attached files, Flash, and XFA forms.
 */
const PDF_FORBIDDEN_NAMES = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/EmbeddedFiles",
  "/RichMedia",
  "/XFA",
];

/*
 * DOCX parts that only exist to run or embed code. Word's own macro-enabled
 * format is .docm, which is refused by name upstream; this catches a .docm
 * renamed to .docx, and the OLE and ActiveX parts a .docx can still carry.
 */
const DOCX_FORBIDDEN_PARTS = [
  /(^|\/)vbaProject\.bin$/i,
  /(^|\/)vbaData\.xml$/i,
  /^word\/embeddings\//i,
  /^word\/activeX\//i,
  /\.(exe|dll|js|vbs|ps1|bat|cmd|com|scr|hta|jar|msi)$/i,
];

/* Relationship types a résumé never needs. */
const DOCX_FORBIDDEN_RELATIONSHIPS = [
  /relationships\/vbaProject/i,
  /relationships\/oleObject/i,
  /relationships\/control\b/i,
  /relationships\/attachedTemplate[^"']*["'][^>]*TargetMode=["']External/i,
  /TargetMode=["']External["'][^>]*relationships\/attachedTemplate/i,
];

/* Field codes that pull in or execute something: DDE, INCLUDE*, and shell links. */
const DOCX_FORBIDDEN_FIELD_CODES = /<w:instrText[^>]*>\s*(DDEAUTO|DDE|INCLUDEPICTURE|INCLUDETEXT|IMPORT)\b/i;

/* Archive limits well above any résumé and well below anything harmful. */
const DOCX_MAX_ENTRIES = 2_000;
const DOCX_MAX_TOTAL_UNCOMPRESSED = 64 * 1024 * 1024;
const DOCX_MAX_SINGLE_UNCOMPRESSED = 32 * 1024 * 1024;
const DOCX_MAX_COMPRESSION_RATIO = 200;
const DOCX_MAX_INSPECTED_PART = 16 * 1024 * 1024;

/*
 * Markup and URLs that are code, not prose. Tight on purpose: a résumé can
 * mention JavaScript as a skill, and "<" appears in plenty of ordinary text,
 * so only the forms that a browser or a shell would act on are matched.
 */
const ACTIVE_TEXT_PATTERNS = [
  /<\s*script\b/i,
  /<\s*\/\s*script\s*>/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*meta\b[^>]*http-equiv/i,
  /<\s*svg\b[^>]*\bon\w+\s*=/i,
  /<\s*img\b[^>]*\bon\w+\s*=/i,
  /<\?php\b/i,
  /<%[=@!]\s*[\w.$(]/,
  /\bjavascript\s*:/i,
  /\bvbscript\s*:/i,
  /\bdata\s*:\s*text\/html/i,
  /\bon(?:error|load|click|mouseover|focus|mouseenter|animationstart)\s*=\s*["']?[\w(]/i,
];

function latin1(bytes: Uint8Array, start = 0, end = bytes.byteLength) {
  return Buffer.from(bytes.buffer, bytes.byteOffset + start, Math.max(0, Math.min(end, bytes.byteLength) - start)).toString("latin1");
}

function startsWith(bytes: Uint8Array, magic: readonly number[]) {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

/* --------------------------------------------------------------------------
 * PDF
 * ------------------------------------------------------------------------ */

/*
 * PDF names may spell any character as #xx, so /J#61vaScript is /JavaScript.
 * Undone before matching, so the disguise is not a bypass.
 */
function decodePdfNameEscapes(source: string) {
  return source.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

export function scanPdfBytes(bytes: Uint8Array): void {
  const head = latin1(bytes, 0, PDF_HEADER_WINDOW);
  if (!head.includes(PDF_MAGIC)) {
    throw new UploadRejectedError("That file is not a PDF. Please upload a PDF, Word (.docx) or plain text résumé.", "not_pdf");
  }

  const source = decodePdfNameEscapes(latin1(bytes));

  for (const name of PDF_FORBIDDEN_NAMES) {
    /* A name ends at whitespace or a delimiter, so /JS does not match /JSON-like data. */
    const pattern = new RegExp(`${name.replace("/", "\\/")}(?=[\\s/\\[\\]<>(){}%]|$)`);
    if (pattern.test(source)) {
      throw new UploadRejectedError(
        "That PDF contains embedded scripts, attachments or active content, which Sartho does not accept. Please export a plain PDF of your résumé and upload that.",
        "pdf_active_content",
      );
    }
  }
}

/* --------------------------------------------------------------------------
 * DOCX (ZIP)
 * ------------------------------------------------------------------------ */

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

/*
 * A minimal reader of the ZIP central directory: enough to know what the
 * archive holds and how big it becomes, without expanding any of it. Reading
 * the central directory rather than walking local headers is deliberate — the
 * local headers are what an unzipper trusts, and lying in them is the oldest
 * trick there is; the directory is what the file says it contains.
 */
function readZipDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = bytes.byteLength;

  /* End of central directory: signature 0x06054b50, at most 65535 bytes of comment after it. */
  let eocd = -1;
  const earliest = Math.max(0, length - 22 - 65_535);
  for (let offset = length - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new UploadRejectedError("That Word file is damaged or is not a .docx document.", "not_docx");

  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  /* ZIP64 markers. A résumé is never four gigabytes; refuse rather than guess. */
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new UploadRejectedError("That Word file uses an archive format Sartho does not accept.", "docx_unsafe_entry");
  }
  if (entryCount > DOCX_MAX_ENTRIES) {
    throw new UploadRejectedError("That Word file contains far more parts than a document should.", "docx_zip_bomb");
  }
  if (directoryOffset + directorySize > eocd) {
    throw new UploadRejectedError("That Word file is damaged or is not a .docx document.", "not_docx");
  }

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new UploadRejectedError("That Word file is damaged or is not a .docx document.", "not_docx");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = Buffer.from(bytes.buffer, bytes.byteOffset + cursor + 46, nameLength).toString("utf8");

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new UploadRejectedError("That Word file uses an archive format Sartho does not accept.", "docx_unsafe_entry");
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/*
 * The bytes of one part, expanded with a hard ceiling on the result. Only
 * stored (0) and deflated (8) entries exist in a real .docx; anything else is
 * refused rather than guessed at.
 */
function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Buffer | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;
  if (header + 30 > bytes.byteLength || view.getUint32(header, true) !== 0x04034b50) return null;
  const nameLength = view.getUint16(header + 26, true);
  const extraLength = view.getUint16(header + 28, true);
  const start = header + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.byteLength) return null;
  const compressed = Buffer.from(bytes.buffer, bytes.byteOffset + start, entry.compressedSize);

  if (entry.method === 0) return compressed;
  if (entry.method !== 8) {
    throw new UploadRejectedError("That Word file uses an archive format Sartho does not accept.", "docx_unsafe_entry");
  }
  try {
    return inflateRawSync(compressed, { maxOutputLength: DOCX_MAX_INSPECTED_PART });
  } catch {
    throw new UploadRejectedError("That Word file is damaged or expands to far more than a document should.", "docx_zip_bomb");
  }
}

function isUnsafeEntryName(name: string) {
  if (!name || name.length > 512) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  if (name.split(/[\\/]/).some((segment) => segment === "..")) return true;
  if (name.includes("\0")) return true;
  return false;
}

export function scanDocxBytes(bytes: Uint8Array): void {
  if (!startsWith(bytes, ZIP_MAGIC)) {
    throw new UploadRejectedError("That file is not a Word (.docx) document. Please upload a PDF, Word (.docx) or plain text résumé.", "not_docx");
  }

  const entries = readZipDirectory(bytes);
  const names = new Set(entries.map((entry) => entry.name));

  if (!names.has("[Content_Types].xml") || !entries.some((entry) => /^word\/document\.xml$/i.test(entry.name))) {
    throw new UploadRejectedError("That file is not a Word (.docx) document. Please upload a PDF, Word (.docx) or plain text résumé.", "not_docx");
  }

  let totalUncompressed = 0;
  let totalCompressed = 0;
  for (const entry of entries) {
    if (isUnsafeEntryName(entry.name)) {
      throw new UploadRejectedError("That Word file contains an unsafe part and cannot be read.", "docx_unsafe_entry");
    }
    if (DOCX_FORBIDDEN_PARTS.some((pattern) => pattern.test(entry.name))) {
      const macro = /vba/i.test(entry.name);
      throw new UploadRejectedError(
        macro
          ? "That Word file contains macros, which Sartho does not accept. Please save it as a plain .docx without macros and upload that."
          : "That Word file contains embedded objects or programs, which Sartho does not accept. Please save a plain .docx and upload that.",
        macro ? "docx_macro" : "docx_embedded_object",
      );
    }
    if (entry.uncompressedSize > DOCX_MAX_SINGLE_UNCOMPRESSED) {
      throw new UploadRejectedError("That Word file expands to far more than a document should.", "docx_zip_bomb");
    }
    totalUncompressed += entry.uncompressedSize;
    totalCompressed += entry.compressedSize;
  }
  if (totalUncompressed > DOCX_MAX_TOTAL_UNCOMPRESSED) {
    throw new UploadRejectedError("That Word file expands to far more than a document should.", "docx_zip_bomb");
  }
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > DOCX_MAX_COMPRESSION_RATIO && totalUncompressed > 1024 * 1024) {
    throw new UploadRejectedError("That Word file expands to far more than a document should.", "docx_zip_bomb");
  }

  /* The content type manifest names macro and OLE parts even when they are renamed. */
  const contentTypes = entries.find((entry) => entry.name === "[Content_Types].xml");
  if (contentTypes) {
    const xml = readZipEntry(bytes, contentTypes)?.toString("utf8") ?? "";
    if (/macroEnabled|vbaProject|ms-word\.template\.macroEnabled/i.test(xml)) {
      throw new UploadRejectedError(
        "That Word file contains macros, which Sartho does not accept. Please save it as a plain .docx without macros and upload that.",
        "docx_macro",
      );
    }
    if (/oleObject|activeX|vnd\.ms-office\.activeX/i.test(xml)) {
      throw new UploadRejectedError(
        "That Word file contains embedded objects or programs, which Sartho does not accept. Please save a plain .docx and upload that.",
        "docx_embedded_object",
      );
    }
  }

  /* Relationships: templates fetched from elsewhere, OLE links, ActiveX controls. */
  for (const entry of entries) {
    if (!/\.rels$/i.test(entry.name)) continue;
    const xml = readZipEntry(bytes, entry)?.toString("utf8") ?? "";
    if (/relationships\/vbaProject/i.test(xml)) {
      throw new UploadRejectedError(
        "That Word file contains macros, which Sartho does not accept. Please save it as a plain .docx without macros and upload that.",
        "docx_macro",
      );
    }
    if (DOCX_FORBIDDEN_RELATIONSHIPS.some((pattern) => pattern.test(xml))) {
      const template = /attachedTemplate/i.test(xml);
      throw new UploadRejectedError(
        template
          ? "That Word file is linked to a template on another server, which Sartho does not accept. Please save a plain .docx and upload that."
          : "That Word file contains embedded objects or programs, which Sartho does not accept. Please save a plain .docx and upload that.",
        template ? "docx_external_template" : "docx_embedded_object",
      );
    }
  }

  /* Field codes in the body that run or fetch: DDE and INCLUDE*. */
  for (const entry of entries) {
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(entry.name)) continue;
    const xml = readZipEntry(bytes, entry)?.toString("utf8") ?? "";
    if (DOCX_FORBIDDEN_FIELD_CODES.test(xml) || /\bDDEAUTO\b/.test(xml)) {
      throw new UploadRejectedError(
        "That Word file contains field codes that run or fetch content, which Sartho does not accept. Please save a plain .docx and upload that.",
        "docx_field_code",
      );
    }
  }
}

/* --------------------------------------------------------------------------
 * Plain text
 * ------------------------------------------------------------------------ */

export function scanTextBytes(bytes: Uint8Array): string {
  if (startsWith(bytes, ZIP_MAGIC) || latin1(bytes, 0, PDF_HEADER_WINDOW).includes(PDF_MAGIC)) {
    throw new UploadRejectedError("That file is not a plain text document. Give it the extension that matches its format and try again.", "text_binary");
  }
  if (bytes.includes(0)) {
    throw new UploadRejectedError("That file is not a plain text document.", "text_binary");
  }

  let text: string;
  try {
    /* Strict decoding: a binary that happens to carry a .txt name is refused, not mangled. */
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new UploadRejectedError("That text file is not UTF-8 encoded, so Sartho cannot read it safely. Save it as UTF-8 and try again.", "text_binary");
  }

  if (text.startsWith("#!")) {
    throw new UploadRejectedError("That file is a script, not a résumé.", "text_active_content");
  }
  assertNoActiveContent(text, "text_active_content");
  return text;
}

/* --------------------------------------------------------------------------
 * Extracted text, whatever the source
 * ------------------------------------------------------------------------ */

export function findActiveContent(text: string): string | null {
  for (const pattern of ACTIVE_TEXT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

export function assertNoActiveContent(text: string, reason: UploadRejectionReason = "extracted_active_content"): void {
  if (findActiveContent(text)) {
    throw new UploadRejectedError(
      "That document contains script or embedded code, which Sartho does not accept in a résumé. Please remove it and upload the document again.",
      reason,
    );
  }
}

/* --------------------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------------------ */

/*
 * Bytes checked against the format the name and media type claim. Throws an
 * UploadRejectedError with a message a person can act on, and a reason the
 * server can log without logging the document.
 */
export function scanUploadBytes(kind: SupportedKind, bytes: Uint8Array): void {
  if (kind === "pdf") scanPdfBytes(bytes);
  else if (kind === "docx") scanDocxBytes(bytes);
  else scanTextBytes(bytes);
}
