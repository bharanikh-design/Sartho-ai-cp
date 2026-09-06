import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResumeChange } from "@/lib/types";
import type { ResumeContent } from "@/lib/resume/content";

/*
 * Saving a draft, whether or not the database has learned about structure yet.
 *
 * Migrations here are run by hand in the SQL editor, so there is always a
 * window where the deployed code and the schema disagree — and it can be either
 * way round. save_resume_draft gained a p_content parameter; call the new form
 * against the old function and PostgREST cannot find a six-argument overload,
 * so every save fails until somebody runs the migration.
 *
 * That window is closed from both sides. The new function gives p_content a
 * default, so a five-argument call still resolves once the migration has run;
 * and this helper drops back to the five-argument call when the function it
 * finds is the old one. The structure is lost on that path — the column does
 * not exist to put it in — but the draft is saved, which is what the person
 * pressing the button cares about.
 *
 * PGRST202 is PostgREST's "no function matches these arguments". The message
 * check is there because the code is not always populated on older gateways,
 * and a false positive costs one retry that fails the same way.
 */
function isMissingOverload(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("save_resume_draft") && (message.includes("does not exist") || message.includes("could not find"));
}

export type SaveResumeDraftArgs = {
  jobId: string;
  versionName: string;
  draft: string;
  changeLog: ResumeChange[];
  evidenceIds: string[];
  content: ResumeContent | null;
};

export async function saveResumeDraft(
  supabase: SupabaseClient,
  args: SaveResumeDraftArgs,
): Promise<{ applicationId: string | null; error: unknown; structureStored: boolean }> {
  const base = {
    p_job_id: args.jobId,
    p_resume_version: args.versionName,
    p_resume_draft: args.draft,
    p_change_log: args.changeLog,
    p_evidence_ids: args.evidenceIds,
  };

  const withContent = await supabase.rpc("save_resume_draft", { ...base, p_content: args.content });
  if (!withContent.error) {
    return { applicationId: withContent.data as string | null, error: null, structureStored: true };
  }
  if (!isMissingOverload(withContent.error)) {
    return { applicationId: null, error: withContent.error, structureStored: false };
  }

  console.warn("save_resume_draft has no p_content yet — saving without the structure. Run the resume_structured_content migration.");
  const fallback = await supabase.rpc("save_resume_draft", base);
  return {
    applicationId: fallback.data as string | null,
    error: fallback.error,
    structureStored: false,
  };
}
