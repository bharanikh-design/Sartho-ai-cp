import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplicationRecord,
  JobRecord,
  JobRequirementRecord,
  ResumeChange,
} from "@/lib/types";

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function resumeChanges(value: unknown): ResumeChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ResumeChange => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<ResumeChange>;
    return typeof candidate.type === "string" && typeof candidate.description === "string" && Array.isArray(candidate.evidenceIds);
  });
}

export async function getJobs(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as JobRecord[];
}

export async function getJobWorkspace(supabase: SupabaseClient, userId: string, jobId: string) {
  const [jobResult, requirementsResult, applicationResult] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).maybeSingle(),
    supabase.from("job_requirements").select("*").eq("job_id", jobId).order("created_at"),
    supabase.from("applications").select("*").eq("job_id", jobId).eq("user_id", userId).maybeSingle(),
  ]);

  const firstError = jobResult.error ?? requirementsResult.error ?? applicationResult.error;
  if (firstError) throw firstError;

  const job = jobResult.data as JobRecord | null;
  const requirements = (requirementsResult.data ?? []).map((item) => ({
    ...item,
    matched_evidence_ids: stringArray(item.matched_evidence_ids),
  })) as JobRequirementRecord[];

  const applicationData = applicationResult.data;
  const application: ApplicationRecord | null = applicationData
    ? {
        ...applicationData,
        resume_change_log: resumeChanges(applicationData.resume_change_log),
        resume_evidence_ids: stringArray(applicationData.resume_evidence_ids),
      } as ApplicationRecord
    : null;

  return { job, requirements, application };
}
