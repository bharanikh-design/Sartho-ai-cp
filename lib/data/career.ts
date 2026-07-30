import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CareerRoleRecord,
  EvidenceRecord,
  ProfileRecord,
  TargetLaneRecord,
} from "@/lib/types";

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getCareerWorkspace(supabase: SupabaseClient, userId: string) {
  const [profileResult, lanesResult, rolesResult, evidenceResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("target_lanes").select("*").eq("user_id", userId).eq("active", true).order("priority"),
    supabase.from("career_roles").select("*").eq("user_id", userId).order("start_date", { ascending: false }),
    supabase.from("evidence_items").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
  ]);

  const firstError = profileResult.error ?? lanesResult.error ?? rolesResult.error ?? evidenceResult.error;
  if (firstError) throw firstError;

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
