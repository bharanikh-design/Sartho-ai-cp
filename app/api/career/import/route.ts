import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructuredJson } from "@/lib/ai/provider";
import { getAuthenticatedUser } from "@/lib/auth";
import { extractResumeText, ResumeExtractionError } from "@/lib/resume/extract-text";
import { toRows } from "@/lib/resume/normalise";

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

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["roles", "evidence", "headline", "summary", "location", "totalExperienceYears"],
  properties: {
    roles: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employer", "title", "location", "startDate", "endDate", "isCurrent", "summary"],
        properties: {
          employer: { type: "string" },
          title: { type: "string" },
          location: { type: ["string", "null"] },
          startDate: { type: ["string", "null"] },
          endDate: { type: ["string", "null"] },
          isCurrent: { type: "boolean" },
          summary: { type: ["string", "null"] },
        },
      },
    },
    evidence: {
      type: "array",
      maxItems: 120,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employer", "title", "claim", "context", "periodLabel", "metrics", "domains", "confidence"],
        properties: {
          employer: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          claim: { type: "string" },
          context: { type: ["string", "null"] },
          periodLabel: { type: ["string", "null"] },
          metrics: { type: "array", maxItems: 8, items: { type: "string" } },
          domains: { type: "array", maxItems: 8, items: { type: "string" } },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    headline: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    totalExperienceYears: { type: ["number", "null"] },
  },
};

const system = [
  "You are Sartho's evidence extractor. You read one résumé and record what it says.",
  "You are not a writer, an editor or a marketer. Do not improve, embellish or reword achievements into stronger claims.",
  "Never state an employer, job title, date, metric, technology, certification or responsibility that is not present in the document.",
  "Every claim must be traceable to a specific line of the résumé. If the résumé is vague, record the vague version.",
  "Put a figure in metrics only when that figure appears in the document. Never estimate, round or infer one.",
  "Set confidence to high when the résumé states the claim outright, medium when it is implied by context, and low when it is a summary of scattered detail.",
  "Attribute every claim to the employer and title it sits under. Leave both null when the résumé does not make that clear.",
  "Dates must be YYYY, YYYY-MM or YYYY-MM-DD exactly as precise as the document is. Use null when a date is absent, and never guess one.",
  "Split responsibilities into separate claims rather than merging several into one sentence.",
].join(" ");

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: "That upload could not be read." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Choose a résumé file to upload." }, { status: 400 });

  let text: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    ({ text } = await extractResumeText({ name: file.name, type: file.type || null, bytes }));
  } catch (caught) {
    const message = caught instanceof ResumeExtractionError
      ? caught.message
      : "Sartho could not read that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: importRow, error: importError } = await supabase
    .from("resume_imports")
    .insert({
      user_id: user.id,
      file_name: file.name,
      mime_type: file.type || null,
      byte_size: file.size,
      status: "processing",
    })
    .select("id")
    .single();

  if (importError || !importRow) {
    return NextResponse.json({ error: importError?.message ?? "Could not start the import." }, { status: 400 });
  }

  try {
    const raw = await generateStructuredJson({
      schemaName: "sartho_resume_extraction",
      schema: jsonSchema,
      system,
      prompt: JSON.stringify({ resumeText: text }),
    });

    const parsed = outputSchema.parse(raw);
    const { roles, evidence } = toRows(
      { roles: parsed.roles, evidence: parsed.evidence },
      file.name,
    );

    if (!evidence.length) {
      throw new Error("Sartho did not find any career evidence in that document.");
    }

    const { data: applied, error: applyError } = await supabase.rpc("apply_resume_import", {
      p_import_id: importRow.id,
      p_roles: roles,
      p_evidence: evidence,
    });
    if (applyError) throw applyError;

    /*
     * Profile details are filled in only where they are still blank. Someone
     * who has written their own headline should not have it replaced by a
     * machine reading of an old résumé.
     */
    const { data: profile } = await supabase
      .from("profiles")
      .select("id,headline,summary,location,total_experience_years")
      .eq("id", user.id)
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
        await supabase.from("profiles").update(patch).eq("id", user.id);
      }
    }

    return NextResponse.json({
      importId: importRow.id,
      ...(applied as Record<string, number>),
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The import failed.";
    await supabase
      .from("resume_imports")
      .update({ status: "failed", error: message.slice(0, 500), completed_at: new Date().toISOString() })
      .eq("id", importRow.id)
      .eq("user_id", user.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
