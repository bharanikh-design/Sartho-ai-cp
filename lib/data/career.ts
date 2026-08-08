import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CareerRoleRecord,
  EvidenceRecord,
  ProfileRecord,
  TargetLaneRecord,
} from "@/lib/types";
import { withJwtClockSkewRetry } from "@/lib/supabase/retry";

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getCareerWorkspace(supabase: SupabaseClient, userId: string) {
  const [profileResult, lanesResult, rolesResult, evidenceResult] = await withJwtClockSkewRetry(
    () => Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("target_lanes").select("*").eq("user_id", userId).eq("active", true).order("priority"),
    supabase.from("career_roles").select("*").eq("user_id", userId).order("start_date", { ascending: false }),
    supabase.from("evidence_items").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    ]),
    ([profile, lanes, roles, evidence]) =>
      profile.error ?? lanes.error ?? roles.error ?? evidence.error,
  );

  const finalError = profileResult.error ?? lanesResult.error ?? rolesResult.error ?? evidenceResult.error;
  if (finalError) throw finalError;

  const profileData = profileResult.data;
  const profile: ProfileRecord | null = profileData
    ? {
        ...profileData,
        total_experience_years: profileData.total_experience_years === null
          ? null
          : Number(profileData.total_experience_years),
        strengths: stringArray(profileData.strengths),
        exclusions: stringArray(profileData.exclusions),
      }
    : null;

  const lanes = (lanesResult.data ?? []).map((lane) => ({
    ...lane,
    weight: Number(lane.weight),
    priority: Number(lane.priority),
  })) as TargetLaneRecord[];

  const roles = (rolesResult.data ?? []) as CareerRoleRecord[];
  const roleById = new Map(roles.map((role) => [role.id, role]));

  const evidence = (evidenceResult.data ?? []).map((item) => ({
    ...item,
    metrics: stringArray(item.metrics),
    domains: stringArray(item.domains),
    career_role: item.career_role_id ? roleById.get(item.career_role_id) ?? null : null,
  })) as EvidenceRecord[];

  return { profile, lanes, roles, evidence };
}

export type ResumeImportRecord = {
  id: string;
  file_name: string;
  label: string | null;
  status: "processing" | "complete" | "failed";
  error: string | null;
  roles_created: number;
  evidence_created: number;
  evidence_skipped: number;
  character_count: number | null;
  byte_size: number | null;
  created_at: string;
  completed_at: string | null;
};

/*
 * The résumé repository.
 *
 * Deliberately does not select extracted_text: these rows drive a list, and a
 * list has no business dragging every document's full text across the wire.
 * The text is there when something actually needs to re-read a résumé.
 */
export async function getResumeImports(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("resume_imports")
    .select("id,file_name,label,status,error,roles_created,evidence_created,evidence_skipped,character_count,byte_size,created_at,completed_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ResumeImportRecord[];
}
