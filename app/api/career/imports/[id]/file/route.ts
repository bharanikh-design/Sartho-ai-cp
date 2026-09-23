import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { isOwnedResumeObjectPath, RESUME_UPLOAD_BUCKET } from "@/lib/resume/upload";

/*
 * The original file, byte for byte.
 *
 * The text column is what the file reader produced; this is the file itself,
 * handed back under the name it was uploaded with, so "is what Sartho kept
 * the same as what I gave it" is a question anybody can answer by opening
 * both.
 */

export const runtime = "nodejs";

const idSchema = z.string().uuid();

/* RFC 5987, so a name with accents or spaces survives the header. */
function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "That résumé is not available." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("resume_imports")
    .select("file_name,mime_type,object_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Could not look up the uploaded résumé", error);
    return NextResponse.json({ error: "Sartho could not find that file." }, { status: 500 });
  }
  const objectPath = (data?.object_path as string | null) ?? null;
  if (!data || !objectPath) {
    return NextResponse.json(
      { error: "The original file for this résumé was not kept. Only its text is available." },
      { status: 404 },
    );
  }
  /* Belt and braces: the row is the person's, and so must be the object it points at. */
  if (!isOwnedResumeObjectPath(objectPath, user.id)) {
    return NextResponse.json({ error: "That résumé is not available." }, { status: 403 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from(RESUME_UPLOAD_BUCKET).download(objectPath);
  if (downloadError || !file) {
    return NextResponse.json({ error: "Sartho could not fetch the original file." }, { status: 404 });
  }

  return new Response(file.stream(), {
    headers: {
      "Content-Type": (data.mime_type as string | null) || file.type || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": contentDisposition(data.file_name as string),
      "Cache-Control": "private, no-store",
      "X-Sartho-Resume-Mode": "original-immutable",
    },
  });
}
