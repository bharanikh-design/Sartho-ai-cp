import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { extractResumeText, ResumeExtractionError } from "@/lib/resume/extract-text";
import { detectKind, MAX_UPLOAD_BYTES, normaliseResumeMimeType } from "@/lib/resume/upload";

/*
 * Read the text out of a résumé file. Nothing else.
 *
 * The workbench in Résumé Studio works on text: it scores it, names the lines
 * with no figure, and rewrites them around what the person tells it. Somebody
 * arriving with a PDF should not have to paste it in by hand, so this turns the
 * file into that text and stops.
 *
 * Deliberately not a second "upload your résumé": it extracts nothing, stores
 * nothing, and creates no evidence. Taking a résumé into the career profile is
 * ResumeImport's job and stays ResumeImport's job — the workbench sends the
 * finished text there when the person chooses to make it their master.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a résumé file to read." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is larger than 8 MB." }, { status: 400 });
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json({ error: "Sartho can read PDF, Word and plain text résumés." }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { text } = await extractResumeText({
      name: file.name,
      type: normaliseResumeMimeType(kind, file.type),
      bytes,
    });
    return NextResponse.json({ text, fileName: file.name });
  } catch (caught) {
    if (caught instanceof ResumeExtractionError) {
      return NextResponse.json({ error: caught.message }, { status: 400 });
    }
    console.error("Could not read the résumé file", caught);
    return NextResponse.json({ error: "Sartho could not read that file." }, { status: 500 });
  }
}
