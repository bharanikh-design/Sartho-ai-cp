import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { downloadDriveFile, downloadFileName } from "@/lib/integrations/drive";
import { googleAccessToken } from "@/lib/integrations/store";
import { MAX_UPLOAD_BYTES, RESUME_UPLOAD_BUCKET, detectKind, makeResumeObjectPath, normaliseResumeMimeType } from "@/lib/resume/upload";

/*
 * Fetch one chosen file out of Drive and put it exactly where an uploaded one
 * would have gone.
 *
 * This route deliberately does not read the résumé, call a model, or write
 * anything to a profile. It lands the bytes in the same bucket, at the same
 * owned path, and hands back the same payload the file picker hands back — so
 * the existing import runs afterwards, unchanged and unaware of where the file
 * came from.
 *
 * The alternative was a second import pipeline for Drive files, which would
 * have been a copy of the streaming progress, the extraction, the evidence
 * writing and the country inference — and the copy that drifts.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  fileId: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(255),
  isGoogleDoc: z.boolean().default(false),
});

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That file is not valid." }, { status: 400 });

  const token = await googleAccessToken(user.id);
  if (!token) {
    return NextResponse.json(
      { error: "Google Drive isn't connected. Connect it on the Integrations page.", code: "not_connected" },
      { status: 409 },
    );
  }

  const fileName = downloadFileName(parsed.data.fileName, parsed.data.isGoogleDoc);

  let bytes: Uint8Array;
  let mimeType: string;
  try {
    ({ bytes, mimeType } = await downloadDriveFile(token, parsed.data.fileId, parsed.data.isGoogleDoc));
  } catch (caught) {
    console.error("Drive download failed", { message: caught instanceof Error ? caught.message : "unknown" });
    return NextResponse.json({ error: "Sartho could not read that file from your Drive." }, { status: 502 });
  }

  /*
   * The same ceiling an upload is held to, checked here as well as there. A
   * file arriving by a different door is not a reason to skip the limit that
   * keeps a 200MB document out of the extractor.
   */
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is too large to read." }, { status: 400 });
  }
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }

  /*
   * And the same format check. Drive's own mime type is not trusted over the
   * filename for the same reason an upload's is not: whichever the reader will
   * use downstream is the one that has to be valid now.
   */
  const kind = detectKind(fileName, mimeType);
  if (!kind) {
    return NextResponse.json({ error: "Sartho can read PDF, Word and plain-text résumés." }, { status: 400 });
  }

  const objectPath = makeResumeObjectPath(user.id, fileName);
  const contentType = normaliseResumeMimeType(kind, mimeType);
  const { error: uploadError } = await supabase.storage
    .from(RESUME_UPLOAD_BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: false });
  if (uploadError) {
    console.error("Unable to store a Drive résumé", { message: uploadError.message });
    return NextResponse.json({ error: "Sartho could not save that file." }, { status: 500 });
  }

  /* Exactly the shape /api/career/import already takes from the file picker. */
  return NextResponse.json({
    objectPath,
    fileName,
    mimeType: contentType,
    byteSize: bytes.byteLength,
  });
}
