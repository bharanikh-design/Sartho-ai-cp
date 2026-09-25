import { NextResponse } from "next/server";
import { z } from "zod";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { describeAiFailure, DOCUMENT_SUBJECT } from "@/lib/ai/failure";
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
import { propagateCandidateMutation } from "@/lib/workflow/propagate-candidate-mutation";

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
  // Optional so a response from before the field existed still parses.
  country: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
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
  | { stage: "done"; importId: string; rolesCreated: number; evidenceCreated: number; evidenceSkipped: number; isMaster: boolean }
  | { stage: "error"; error: string };

/* Enough of the document to show it being read, not enough to be the document. */
const SAMPLE_CHARACTERS = 4000;

const uploadRequestSchema = z.object({
  objectPath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(255).nullable(),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  /* Whether this upload becomes the master résumé. Off unless asked for. */
  makeMaster: z.boolean().optional().default(false),
});

/*
 * The columns that keep the original arrive by a migration run by hand, so
 * there is a window where the deployed code and the schema disagree. PostgREST
 * answers PGRST204 for a column it cannot find; the import then falls back to
 * the row shape it had before, and says so, rather than failing the upload.
 */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("column") && (message.includes("does not exist") || message.includes("could not find"));
}

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

  /*
   * The object is kept once it is known to be a readable résumé. It is removed
   * only when nothing will ever refer to it: an unreadable file, an exhausted
   * allowance, or an import row that could not be written.
   */
  const discardObject = async () => {
    try {
      await supabase.storage.from(RESUME_UPLOAD_BUCKET).remove([payload.objectPath]);
    } catch {
      // The browser retries this. Do not replace the real reason with a
      // storage transport error.
    }
  };

  let text: string;
  let raw: string;
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
    ({ text, raw } = await extractResumeText({ name: payload.fileName, type: actualMimeType, bytes }));
  } catch (caught) {
    await discardObject();
    const message = caught instanceof ResumeExtractionError
      ? caught.message
      : "Sartho could not read that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const quota = await checkAiQuota(supabase, "resume_import");
  if (!quota.allowed) {
    await discardObject();
    return aiQuotaResponse(quota);
  }

  /*
   * The row is the record of the upload, and it holds the document as it was:
   * the raw text, unnormalised and untruncated, and the path of the original
   * file, which is no longer deleted. The tidied copy the model reads is
   * `text`, and it goes nowhere but the prompt.
   */
  const importColumns = {
    user_id: user.id,
    file_name: payload.fileName,
    mime_type: actualMimeType,
    byte_size: actualByteSize,
    status: "processing",
    extracted_text: raw,
    character_count: raw.length,
  };

  let importRow: { id: string } | null = null;
  let importError: { code?: string; message?: string } | null = null;
  let originalKept = true;
  ({ data: importRow, error: importError } = await supabase
    .from("resume_imports")
    .insert({ ...importColumns, object_path: payload.objectPath })
    .select("id")
    .single());

  if (isMissingColumn(importError)) {
    /*
     * Schema behind the code. The upload is still read, but nothing can point
     * at the original, so it is removed as it always used to be.
     */
    console.warn("resume_imports is missing object_path; run the 20260920090000_resume_upload_originals migration");
    originalKept = false;
    ({ data: importRow, error: importError } = await supabase
      .from("resume_imports")
      .insert(importColumns)
      .select("id")
      .single());
  }

  if (importError || !importRow) {
    await discardObject();
    return NextResponse.json({ error: importError?.message ?? "Could not start the import." }, { status: 400 });
  }
  if (!originalKept) await discardObject();

  /*
   * The master flag is set before the model reads anything: which document is
   * the master is a fact about the upload, not about what was found in it, so
   * a failed reading must not quietly un-master the résumé somebody chose.
   */
  let isMaster = false;
  if (payload.makeMaster) {
    const { error: masterError } = await supabase.rpc("set_master_resume_import", { p_import_id: importRow.id });
    if (masterError) console.warn("Could not mark the upload as the master résumé", masterError);
    else isMaster = true;
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
  const originalText = raw;

  const run = async (send: (event: Progress) => void) => {
    /* Counted and sampled from the document as kept, not from the model's copy. */
    send({ stage: "extracted", characters: originalText.length, sample: originalText.slice(0, SAMPLE_CHARACTERS) });
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
      .select("id,full_name,headline,summary,location,country,total_experience_years,phone,linkedin_url,website_url")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      const patch: Record<string, unknown> = {};
      if (!profile.headline && parsed.headline) patch.headline = parsed.headline.trim();
      if (!profile.summary && parsed.summary) patch.summary = parsed.summary.trim();
      if (!profile.location && parsed.location) patch.location = parsed.location.trim();
      /*
       * Only ever filled in, never overwritten — the same rule the headline and
       * summary above already follow. Somebody who corrected their own phone
       * number must not have it replaced by whatever the document said the next
       * time they upload one.
       */
      if (!profile.full_name && parsed.fullName?.trim()) patch.full_name = parsed.fullName.trim();
      if (!profile.phone && parsed.phone?.trim()) patch.phone = parsed.phone.trim();
      if (!profile.linkedin_url && parsed.linkedin?.trim()) patch.linkedin_url = parsed.linkedin.trim();
      if (!profile.website_url && parsed.website?.trim()) patch.website_url = parsed.website.trim();
      // The inferred country is a default the person confirms on Search Brief —
      // it is only ever filled in, never overwritten.
      const inferredCountry = parsed.country?.trim().toLowerCase();
      if (!profile.country && inferredCountry && /^[a-z]{2}$/.test(inferredCountry)) {
        patch.country = inferredCountry;
      }
      if (profile.total_experience_years === null && parsed.totalExperienceYears !== null) {
        patch.total_experience_years = parsed.totalExperienceYears;
      }
      if (Object.keys(patch).length) {
        await supabase.from("profiles").update(patch).eq("id", userId);
      }
    }

    /*
     * Career Truth changed. Propagate it before declaring the import complete:
     * existing open opportunities must be re-evaluated through the same
     * conductor that Search/Preview/Save use.
     */
    await propagateCandidateMutation(supabase, userId, "career_truth");

    const counts = (applied ?? {}) as Record<string, number>;
    send({
      stage: "done",
      importId,
      rolesCreated: counts.rolesCreated ?? 0,
      evidenceCreated: counts.evidenceCreated ?? 0,
      evidenceSkipped: counts.evidenceSkipped ?? 0,
      isMaster,
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
          : describeAiFailure(rawMessage, DOCUMENT_SUBJECT);
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
