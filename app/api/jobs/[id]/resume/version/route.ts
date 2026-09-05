import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

/*
 * Save an improved draft as a new version.
 *
 * No AI and no quota: the text arriving here has already been through the
 * bullet rewriter or been typed by the person themselves, and every rewrite was
 * approved line by line before it got this far. This route only records what
 * they decided to keep.
 *
 * It goes through save_resume_draft, which appends to resume_versions and then
 * updates the current pointer — so the version being improved on survives, and
 * the ATS score of each is comparable in the Studio.
 */

export const runtime = "nodejs";

const changeSchema = z.object({
  type: z.enum(["emphasised", "reworded", "omitted", "moved"]),
  description: z.string().trim().min(3).max(400),
  evidenceIds: z.array(z.string()).default([]),
});

const inputSchema = z.object({
  draft: z.string().trim().min(50).max(40_000),
  versionName: z.string().trim().min(2).max(180).optional(),
  changes: z.array(changeSchema).max(60).default([]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "There is nothing to save." }, { status: 400 });
  }

  /*
   * The evidence ids stay those of the version this was built from: an edit
   * that quantifies a line does not change which approved claims back it.
   */
  const { data: existing, error: readError } = await supabase
    .from("applications")
    .select("resume_version,resume_evidence_ids")
    .eq("user_id", user.id)
    .eq("job_id", id)
    .maybeSingle();
  if (readError) {
    console.error("Unable to read the current résumé version", readError);
    return NextResponse.json({ error: "Sartho could not save this version." }, { status: 500 });
  }

  const { data: applicationId, error } = await supabase.rpc("save_resume_draft", {
    p_job_id: id,
    p_resume_version: input.data.versionName ?? existing?.resume_version ?? "Tailored résumé",
    p_resume_draft: input.data.draft,
    p_change_log: input.data.changes,
    p_evidence_ids: existing?.resume_evidence_ids ?? [],
  });
  if (error) {
    console.error("Unable to save the improved résumé version", error);
    return NextResponse.json({ error: "Sartho could not save this version." }, { status: 500 });
  }

  return NextResponse.json({ applicationId });
}
