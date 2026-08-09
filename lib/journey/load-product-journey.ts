import type { SupabaseClient } from "@supabase/supabase-js";
import { getCareerWorkspace, getResumeImports } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { buildProductJourney } from "./product-journey";
import type { ProfileRecord } from "@/lib/types";

export async function loadProductJourney(supabase: SupabaseClient, userId: string) {
  const [workspace, imports, searchPreferences] = await Promise.all([
    getCareerWorkspace(supabase, userId),
    getResumeImports(supabase, userId),
    getSearchPreferences(supabase, userId),
  ]);

  const approvedEvidence = workspace.evidence.filter((item) => item.approval_status === "approved").length;
  const pendingEvidence = workspace.evidence.filter((item) => item.approval_status === "pending").length;
  const activeLanes = workspace.lanes.filter((lane) => lane.active);

  const journey = buildProductJourney({
    profile: workspace.profile,
    completeImports: imports.filter((item) => item.status === "complete").length,
    roles: workspace.roles.length,
    evidence: workspace.evidence.length,
    approvedEvidence,
    pendingEvidence,
    activeLanes: activeLanes.length,
    activeLaneAllocation: activeLanes.reduce((total, lane) => total + lane.weight, 0),
    searchPreferences,
  });

  return { journey, workspace, imports, searchPreferences };
}

/** Lightweight shell/Journey loader: it never transfers evidence claims or résumé text. */
export async function loadProductJourneyStatus(supabase: SupabaseClient, userId: string) {
  const [profileResult, lanesResult, rolesResult, evidenceResult, importsResult, searchPreferences] = await Promise.all([
    supabase.from("profiles").select("id,full_name,location,headline,summary,total_experience_years,work_authorisation,strengths,exclusions").eq("id", userId).maybeSingle(),
    supabase.from("target_lanes").select("weight,active").eq("user_id", userId).eq("active", true),
    supabase.from("career_roles").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("evidence_items").select("approval_status").eq("user_id", userId),
    supabase.from("resume_imports").select("status").eq("user_id", userId).is("archived_at", null),
    getSearchPreferences(supabase, userId),
  ]);

  const error = profileResult.error ?? lanesResult.error ?? rolesResult.error ?? evidenceResult.error ?? importsResult.error;
  if (error) throw error;

  const rawProfile = profileResult.data;
  const profile: ProfileRecord | null = rawProfile ? {
    ...rawProfile,
    total_experience_years: rawProfile.total_experience_years === null ? null : Number(rawProfile.total_experience_years),
    strengths: Array.isArray(rawProfile.strengths) ? rawProfile.strengths.filter((item): item is string => typeof item === "string") : [],
    exclusions: Array.isArray(rawProfile.exclusions) ? rawProfile.exclusions.filter((item): item is string => typeof item === "string") : [],
  } : null;
  const evidenceStatuses = evidenceResult.data ?? [];
  const activeLanes = lanesResult.data ?? [];

  return buildProductJourney({
    profile,
    completeImports: (importsResult.data ?? []).filter((item) => item.status === "complete").length,
    roles: rolesResult.count ?? 0,
    evidence: evidenceStatuses.length,
    approvedEvidence: evidenceStatuses.filter((item) => item.approval_status === "approved").length,
    pendingEvidence: evidenceStatuses.filter((item) => item.approval_status === "pending").length,
    activeLanes: activeLanes.length,
    activeLaneAllocation: activeLanes.reduce((total, lane) => total + Number(lane.weight), 0),
    searchPreferences,
  });
}
