import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { describeAiFailure } from "@/lib/ai/failure";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { extractResumeText, ResumeExtractionError } from "@/lib/resume/extract-text";
import {
  RESUME_EXTRACTION_SCHEMA,
  RESUME_EXTRACTION_SCHEMA_NAME,
  RESUME_EXTRACTION_SYSTEM,
} from "@/lib/resume/extraction-schema";
import { toRows } from "@/lib/resume/normalise";
import {
  isOwnedResumeObjectPath,
  MAX_UPLOAD_BYTES,
  RESUME_UPLOAD_BUCKET,
} from "@/lib/resume/upload";

/*
 * Résumé import — the way career evidence enters Sartho.
 *
 * Everything the product does downstream reads evidence_items. This is the
 * only thing that writes to it, and it writes every claim as pending. Nothing
 * reaches a résumé or an application until the person it belongs to has read
 * it and said yes.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const outputSchema = z.object({
  roles: z
    .array(
      z.object({
        employer: z.string().min(1),
        title: z.string().min(1),
        location: z.string().nullable(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        isCurrent: z.boolean(),
        summary: z.string().nullable(),
      }),
    )
    .max(40),
  evidence: z
    .array(
      z.object({
        employer: z.string().nullable(),
        title: z.string().nullable(),
        claim: z.string().min(10),
        context: z.string().nullable(),
        periodLabel: z.string().nullable(),
        metrics: z.array(z.string()).max(8),
        domains: z.array(z.string()).max(8),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(120),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  location: z.string().nullable(),
  totalExperienceYears: z.number().nullable(),
});

/*
 * Progress is reported, not estimated.
 *
 * Reading a résumé takes as long as it takes — the model is the slow part and
 * it does not report a percentage, so inventing one would be a progress bar
 * that lies about a product whose whole argument is that it does not. What the
 * server can say honestly is which stage it is on and what it has actually
 * found, so it says exactly that, as it happens, down a newline-delimited JSON
 * stream. The alternative is what this was: a request that returns nothing for
 * up to two minutes while the page appears to have died.
 */
type Progress =
  | { stage: "extracted"; characters: number; sample: string }
  | { stage: "reading" }
  | { stage: "saving"; roles: number; claims: number }
  | { stage: "done"; importId: string; rolesCreated: number; evidenceCreated: number; evidenceSkipped: number }
  | { stage: "error"; error: string };

/* Enough of the document to show it being read, not enough to be the document. */
const SAMPLE_CHARACTERS = 4000;

const uploadRequestSchema = z.object({
  objectPath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(255).nullable(),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: z.infer<typeof uploadRequestSchema>;
  try {
    payload = uploadRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "That résumé upload is not valid." }, { status: 400 });
  }

  if (!isOwnedResumeObjectPath(payload.objectPath, user.id)) {
    return NextResponse.json({ error: "That résumé upload is not available." }, { status: 403 });
  }

  let text: string;
  let actualByteSize = 0;
  let actualMimeType = payload.mimeType;
  try {
    const { data: storedFile, error: downloadError } = await supabase.storage
      .from(RESUME_UPLOAD_BUCKET)
      .download(payload.objectPath);
    if (downloadError || !storedFile) {
      return NextResponse.json({ error: "That résumé upload could not be read." }, { status: 400 });
    }

    actualByteSize = storedFile.size;
    actualMimeType = storedFile.type || payload.mimeType;
    const bytes = new Uint8Array(await storedFile.arrayBuffer());
    ({ text } = await extractResumeText({ name: payload.fileName, type: actualMimeType, bytes }));
  } catch (caught) {
    const message = caught instanceof ResumeExtractionError
      ? caught.message
      : "Sartho could not read that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    // Original bytes are transient. The extracted text is the repository
    // record; retention for that record is handled separately.
    try {
      await supabase.storage.from(RESUME_UPLOAD_BUCKET).remove([payload.objectPath]);
    } catch {
      // Cleanup is retried by the browser. Do not replace the real extraction
      // result with a storage transport error.
    }
  }

  const quota = await checkAiQuota(supabase, "resume_import");
  if (!quota.allowed) return aiQuotaResponse(quota);

  const { data: importRow, error: importError } = await supabase
    .from("resume_imports")
    .insert({
      user_id: user.id,
      file_name: payload.fileName,
      mime_type: actualMimeType,
      byte_size: actualByteSize,
      status: "processing",
      // Kept, not consumed. A résumé that can only be read once is a log entry.
      extracted_text: text,
      character_count: text.length,
    })
    .select("id")
    .single();

  if (importError || !importRow) {
    return NextResponse.json({ error: importError?.message ?? "Could not start the import." }, { status: 400 });
  }

  /*
   * Everything that could fail fast has now failed fast, with a real status
   * code. From here the work is long and the answer is a stream, so failures
   * arrive as an error event on a 200 — the client handles both shapes.
   *
   * The narrowed values are bound to plain constants first: the streaming body
   * runs inside a closure, and a closure cannot rely on the narrowing that the
   * guards above established.
   */
  const userId = user.id;
  const importId = importRow.id;
  const sourceName = payload.fileName;
  const resumeText = text;

  const run = async (send: (event: Progress) => void) => {
    send({ stage: "extracted", characters: resumeText.length, sample: resumeText.slice(0, SAMPLE_CHARACTERS) });
    send({ stage: "reading" });

    const raw = await generateStructuredJson({
      workload: "fast",
      safetyIdentifier: createSafetyIdentifier(userId),
      schemaName: RESUME_EXTRACTION_SCHEMA_NAME,
      schema: RESUME_EXTRACTION_SCHEMA,
      system: RESUME_EXTRACTION_SYSTEM,
      prompt: JSON.stringify({ resumeText }),
    });

    const parsed = outputSchema.parse(raw);
    const { roles, evidence } = toRows(
      { roles: parsed.roles, evidence: parsed.evidence },
      sourceName,
    );

    if (!evidence.length) {
      throw new Error("Sartho did not find any career evidence in that document.");
    }

    send({ stage: "saving", roles: roles.length, claims: evidence.length });

    const { data: applied, error: applyError } = await supabase.rpc("apply_resume_import", {
      p_import_id: importId,
      p_roles: roles,
      p_evidence: evidence,
    });
    if (applyError) throw applyError;

    /*
     * The résumé the person uploaded is taken as approved and final. There is
     * no separate line-by-line confirmation step, so every claim this import
     * created is approved immediately — the same transition the old confirm
     * action performed, done automatically here.
     */
    await supabase
      .from("evidence_items")
      .update({ approval_status: "approved", safe_for_resume: true })
      .eq("user_id", userId)
      .eq("approval_status", "pending");

    /*
     * Profile details are filled in only where they are still blank. Someone
     * who has written their own headline should not have it replaced by a
     * machine reading of an old résumé.
     */
    const { data: profile } = await supabase
      .from("profiles")
      .select("id,headline,summary,location,total_experience_years")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      const patch: Record<string, unknown> = {};
      if (!profile.headline && parsed.headline) patch.headline = parsed.headline.trim();
      if (!profile.summary && parsed.summary) patch.summary = parsed.summary.trim();
      if (!profile.location && parsed.location) patch.location = parsed.location.trim();
      if (profile.total_experience_years === null && parsed.totalExperienceYears !== null) {
        patch.total_experience_years = parsed.totalExperienceYears;
      }
      if (Object.keys(patch).length) {
        await supabase.from("profiles").update(patch).eq("id", userId);
      }
    }

    const counts = (applied ?? {}) as Record<string, number>;
    send({
      stage: "done",
      importId,
      rolesCreated: counts.rolesCreated ?? 0,
      evidenceCreated: counts.evidenceCreated ?? 0,
      evidenceSkipped: counts.evidenceSkipped ?? 0,
    });
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Progress) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        await run(send);
      } catch (caught) {
        const rawMessage = caught instanceof Error ? caught.message : "The import failed.";
        const message = rawMessage === "Sartho did not find any career evidence in that document."
          ? rawMessage
          : describeAiFailure(rawMessage);
        logError(supabase, "career_import", caught);
        await supabase
          .from("resume_imports")
          .update({ status: "failed", error: message.slice(0, 500), completed_at: new Date().toISOString() })
          .eq("id", importId)
          .eq("user_id", userId);
        send({ stage: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Stops an intermediary buffering the whole stream and defeating the point.
      "X-Accel-Buffering": "no",
    },
  });
}
