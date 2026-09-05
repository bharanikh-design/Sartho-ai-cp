import type { SupabaseClient } from "@supabase/supabase-js";

export type SearchSourcePreference = {
  id: string;
  name: string;
  url: string;
  type: string;
  coverage: string;
  trust: string;
  active: boolean;
};

export type SearchPreferences = {
  /** ISO-3166 alpha-2 job market the person chose; null until they confirm one. */
  country: string | null;
  targetLocations: string[];
  /** Employers to search directly, on top of the role queries. */
  targetCompanies: string[];
  remotePreference: string | null;
  sources: SearchSourcePreference[];
};

function isSearchSource(value: unknown): value is SearchSourcePreference {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return typeof source.id === "string"
    && typeof source.name === "string"
    && typeof source.url === "string"
    && typeof source.active === "boolean";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getSearchPreferences(supabase: SupabaseClient, userId: string): Promise<SearchPreferences> {
  const { data, error } = await supabase
    .from("search_preferences")
    .select("country,target_locations,target_companies,remote_preference,sources")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  return {
    country: typeof data?.country === "string" && data.country.trim() ? data.country.trim().toLowerCase() : null,
    targetLocations: stringList(data?.target_locations),
    targetCompanies: stringList(data?.target_companies),
    remotePreference: typeof data?.remote_preference === "string" ? data.remote_preference : null,
    sources: Array.isArray(data?.sources) ? data.sources.filter(isSearchSource) : [],
  };
}
