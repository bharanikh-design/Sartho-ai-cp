import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { resumeContentSchema } from "@/lib/resume/content-schema";
import { parseResumeContent } from "@/lib/resume/content";
import { resumeDocxBuffer } from "@/lib/resume/docx";
import { parseFidelity, type ParseFidelity } from "@/lib/resume/parse-check";

/*
 * Read the files back the way an applicant tracking system would.
 *
 * The Word file is built here from the document and read back with the same
 * library the import uses. The PDF is drawn in the browser — the PDF renderer
 * is a client module — so it arrives as bytes and is read back with the same
 * PDF reader the import uses. No model, no quota: this is the parser, and the
 * question is only whether what went in comes out.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const rawContent = form?.get("content");
  if (typeof rawContent !== "string") {
    return NextResponse.json({ error: "Send the document to check." }, { status: 400 });
  }
  let parsedInput: unknown;
  try { parsedInput = JSON.parse(rawContent); } catch { parsedInput = null; }
  const validated = resumeContentSchema.safeParse(parsedInput);
  const content = validated.success ? parseResumeContent(validated.data) : null;
  if (!content) return NextResponse.json({ error: "Sartho could not read that document." }, { status: 400 });

  let docx: ParseFidelity;
  try {
    const bytes = await resumeDocxBuffer(content);
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    docx = parseFidelity(content, value);
  } catch (caught) {
    console.error("Word parse check failed", caught);
    return NextResponse.json({ error: "Sartho could not read the Word file back." }, { status: 500 });
  }

  let pdf: ParseFidelity | null = null;
  const pdfFile = form?.get("pdf");
  if (pdfFile instanceof File && pdfFile.size > 0) {
    if (pdfFile.size > MAX_PDF_BYTES) return NextResponse.json({ error: "That PDF is larger than 8 MB." }, { status: 400 });
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const document = await getDocumentProxy(new Uint8Array(await pdfFile.arrayBuffer()));
      const { text } = await extractText(document, { mergePages: true });
      pdf = parseFidelity(content, Array.isArray(text) ? text.join("\n") : text);
    } catch (caught) {
      console.error("PDF parse check failed", caught);
      pdf = { items: [], found: 0, total: 0, orderPreserved: false, ok: false };
    }
  }

  return NextResponse.json({ docx, pdf });
}
