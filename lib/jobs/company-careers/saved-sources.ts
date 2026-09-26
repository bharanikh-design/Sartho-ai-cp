import type { SupabaseClient } from "@supabase/supabase-js";
import { employerKey } from "./registry";
import type { EmployerPortalConfig } from "./types";

/*
 * The careers pages a person verified, loaded back.
 *
 * "Test connection" on the Search Brief discovers the applicant tracking
 * system behind a URL, queries it live to prove it is real, and reports
 * "✓ Connected". Until this existed it then discarded the configuration and
 * kept only the employer's name — so the next search matched that name against
 * nine hardcoded companies, found nothing, and reported the employer as
 * `unknown` with zero jobs. The person had done everything right.
 *
 * Nothing here is allowed to fail a search. A missing table, a dropped
 * connection or a row written by an older shape resolves to "no saved
 * sources", which is exactly the behaviour there was before.
 */

export type SavedCareerSource = {
  employer: string;
  config: EmployerPortalConfig;
  careersUrl: string | null;
  verifiedAt: string | null;
  jobsFound: number;
};

/** Enough of an EmployerPortalConfig to be usable, read back from JSON. */
function readConfig(value: unknown, employer: string): EmployerPortalConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  const tenant = raw.tenant;
  if (type !== "workday" && type !== "greenhouse" && type !== "lever") return null;
  if (typeof tenant !== "string" || !tenant.trim()) return null;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : employerKey(employer) || "saved",
    name: typeof raw.name === "string" && raw.name ? raw.name : employer,
    aliases: Array.isArray(raw.aliases)
      ? raw.aliases.filter((alias): alias is string => typeof alias === "string")
      : [employer],
    type,
    tenant: tenant.trim(),
    site: typeof raw.site === "string" && raw.site ? raw.site : undefined,
    domain: typeof raw.domain === "string" && raw.domain ? raw.domain : undefined,
  };
}

export async function loadEmployerCareerSources(
  supabase: SupabaseClient,
  userId: string,
): Promise<EmployerPortalConfig[]> {
  try {
    const { data, error } = await supabase
      .from("employer_career_sources")
      .select("employer,config")
      .eq("user_id", userId);
    if (error || !Array.isArray(data)) return [];

    return data
      .map((row) => readConfig(row.config, typeof row.employer === "string" ? row.employer : ""))
      .filter((config): config is EmployerPortalConfig => config !== null);
  } catch {
    return [];
  }
}

/**
 * Keep a source the live check just proved.
 *
 * Upserted on (user, employer) so re-testing replaces rather than accumulating
 * a row per attempt. Returns whether it was kept, because the screen says
 * "verified employers are added to your targets" and should only say that when
 * it is true.
 */
export async function saveEmployerCareerSource(
  supabase: SupabaseClient,
  userId: string,
  source: SavedCareerSource,
): Promise<boolean> {
  const key = employerKey(source.employer);
  if (!key) return false;

  try {
    const { error } = await supabase
      .from("employer_career_sources")
      .upsert({
        user_id: userId,
        employer: source.employer.trim(),
        employer_key: key,
        config: source.config,
        careers_url: source.careersUrl,
        provider: source.config.type,
        verified_at: source.verifiedAt ?? new Date().toISOString(),
        jobs_found: source.jobsFound,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,employer_key" });
    return !error;
  } catch {
    return false;
  }
}
