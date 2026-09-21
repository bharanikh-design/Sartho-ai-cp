import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { describeAiFailure, DOCUMENT_SUBJECT } from "@/lib/ai/failure";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { renderResumeText } from "@/lib/resume/content";
import {
  contentFromStructuredUpload,
  placedWordShare,
  STRUCTURE_UPLOAD_RULES,
  STRUCTURE_UPLOAD_SCHEMA,
  structuredUploadOutput,
} from "@/lib/resume/structure-upload";

/*
 * Open an uploaded résumé in the editor.
 *
 * The upload is kept as text, word for word. The editor needs a document. This
 * lays the text out as one — copying, never writing — and saves it as the
 * master, which is the one résumé in the product that is not about any advert
 * and the one the editor already knows how to save back over itself. From
 * there it has the ATS score, the coaching, the templates and the downloads
 * that every other résumé has.
 *
 * The upload itself is untouched by this. The document is a derived copy that
 * remembers which file it came from.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z.object({ importId: z.string().uuid() });

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("column") && (message.includes("does not exist") || message.includes("could not find"));
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedInput = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsedInput.success) return NextResponse.json({ error: "Choose an uploaded résumé to open." }, { status: 400 });
  const { importId } = parsedInput.data;

  const { data: upload, error: uploadError } = await supabase
    .from("resume_imports")
    .select("id,file_name,extracted_text")
    .eq("id", importId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (uploadError) {
    console.error("Could not read the uploaded résumé", uploadError);
    return NextResponse.json({ error: "Sartho could not read that résumé." }, { status: 500 });
  }
  const rawText = ((upload?.extracted_text as string | null) ?? "").trim();
  if (!upload || !rawText) {
    return NextResponse.json({ error: "That résumé has no text to lay out." }, { status: 404 });
  }

  const quota = await checkAiQuota(supabase, "resume_draft");
  if (!quota.allowed) return aiQuotaResponse(quota);

  try {
    const raw = await generateStructuredJson({
      workload: "quality",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_resume_layout",
      schema: STRUCTURE_UPLOAD_SCHEMA,
      system: STRUCTURE_UPLOAD_RULES,
      prompt: JSON.stringify({ resumeText: upload.extracted_text }),
    });
    const parsed = structuredUploadOutput.parse(raw);
    const content = contentFromStructuredUpload(parsed, { importId, fallbackEmail: user.email ?? "" });

    if (!content.roles.length && !content.sections.length && !content.summary) {
      return NextResponse.json({ error: "Sartho could not make out the sections of that résumé." }, { status: 422 });
    }

    const draft = renderResumeText(content);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({ master_resume: content, master_resume_text: draft, master_resume_updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (isMissingColumn(saveError)) {
      return NextResponse.json(
        { error: "This deployment is missing the master_resume columns. The administrator needs to run the 20260912080000_master_resume migration." },
        { status: 503 },
      );
    }
    if (saveError) throw saveError;

    return NextResponse.json({
      content,
      draft,
      fileName: upload.file_name,
      /* How much of the file made it onto the page, so nobody has to take it on trust. */
      placed: placedWordShare(rawText, content),
    });
  } catch (caught) {
    console.error("Laying out the uploaded résumé failed", caught);
    const message = caught instanceof Error ? caught.message : "";
    return NextResponse.json(
      { error: message.startsWith("Sartho") ? message : describeAiFailure(message || "The layout failed.", DOCUMENT_SUBJECT) },
      { status: 500 },
    );
  }
}
