import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { evidenceIdsIn, renderResumeText } from "@/lib/resume/content";
import { saveResumeDraft } from "@/lib/resume/save";

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

/*
 * The document the editor holds. Bounded at every level, because this is the
 * one route a person can post arbitrary structure to.
 */
const contentSchema = z.object({
  headline: z.string().trim().max(400).default(""),
  summary: z.string().trim().max(4_000).default(""),
  sections: z.array(z.object({
    id: z.string().trim().max(64).default(""),
    heading: z.string().trim().max(200).default(""),
    bullets: z.array(z.object({
      id: z.string().trim().max(64).default(""),
      text: z.string().trim().min(1).max(2_000),
      evidenceIds: z.array(z.string().max(64)).max(40).default([]),
      edited: z.boolean().default(false),
    })).max(60).default([]),
  })).max(20).default([]),
});

/*
 * `content` is the document; `draft` is the older text-only path the bullet
 * rewriter used before the structure was kept. When content arrives the text
 * is rendered from it here rather than taken from the request, so a client
 * cannot save a document and a body of text that describe different résumés.
 */
const inputSchema = z.object({
  content: contentSchema.optional(),
  draft: z.string().trim().min(50).max(40_000).optional(),
  versionName: z.string().trim().min(2).max(180).optional(),
  changes: z.array(changeSchema).max(60).default([]),
}).refine((value) => value.content || value.draft, {
  message: "Nothing to save.",
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

  const content = input.data.content ?? null;
  const draft = content ? renderResumeText(content) : input.data.draft;
  if (!draft || draft.length < 50) {
    return NextResponse.json({ error: "There is nothing to save." }, { status: 400 });
  }

  /*
   * Evidence ids come from the document when it carries any, because editing
   * can remove a bullet and with it the only line a claim backed.
   *
   * When it carries none they are kept from the row instead. That is the case
   * for a draft recovered from the text column — the old flattener stored one
   * flat list for the whole document and no per-line mapping — and deriving
   * from it would silently erase the record of what the résumé was built on.
   */
  const derived = content ? evidenceIdsIn(content) : [];
  const evidenceIds = derived.length ? derived : (existing?.resume_evidence_ids ?? []);

  const { applicationId, error } = await saveResumeDraft(supabase, {
    jobId: id,
    versionName: input.data.versionName ?? existing?.resume_version ?? "Tailored résumé",
    draft,
    changeLog: input.data.changes,
    evidenceIds,
    content,
  });
  if (error) {
    console.error("Unable to save the improved résumé version", error);
    return NextResponse.json({ error: "Sartho could not save this version." }, { status: 500 });
  }

  return NextResponse.json({ applicationId });
}
