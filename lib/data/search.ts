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
  targetLocations: string[];
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

export async function getSearchPreferences(supabase: SupabaseClient, userId: string): Promise<SearchPreferences> {
  const { data, error } = await supabase
    .from("search_preferences")
    .select("target_locations,remote_preference,sources")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  return {
    targetLocations: Array.isArray(data?.target_locations)
      ? data.target_locations.filter((item): item is string => typeof item === "string")
      : [],
    remotePreference: typeof data?.remote_preference === "string" ? data.remote_preference : null,
    sources: Array.isArray(data?.sources) ? data.sources.filter(isSearchSource) : [],
  };
}
