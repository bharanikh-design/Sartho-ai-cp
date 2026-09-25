import { createAdminClient } from "@/lib/supabase/admin";
import { buildUserTable, type UserTableRow } from "@/lib/analytics/user-table";

export const USER_TABLE_LIMIT = 500;

type SoftQueryResult<T> = {
  data: T;
  unavailable: boolean;
};

export async function softQuery<T>(
  label: string,
  operation: () => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
  fallback: T,
): Promise<SoftQueryResult<T>> {
  try {
    const result = await operation();
    if (result.error) {
      console.warn("Admin telemetry source unavailable", { label, code: result.error.code });
      return { data: fallback, unavailable: true };
    }
    return { data: result.data ?? fallback, unavailable: false };
  } catch (error) {
    console.warn("Admin telemetry source unavailable", { label, error });
    return { data: fallback, unavailable: true };
  }
}


export type AudienceSummary = {
  anonymousVisitors: number;
  anonymousNeverLoggedIn: number;
  anonymousConverted: number;
  anonymousActiveLast7Days: number;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function searchBriefComplete(row: {
  country: string | null;
  target_locations: unknown;
  remote_preference: string | null;
  sources: unknown;
}): boolean {
  const sources = Array.isArray(row.sources)
    ? row.sources.filter((source): source is { active?: unknown } => Boolean(source && typeof source === "object"))
    : [];
  const locations = stringArray(row.target_locations);
  const remote = (row.remote_preference ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return Boolean(row.country || locations.length)
    && remote.length > 0
    && sources.some((source) => source.active === true);
}

export async function loadUserTable(): Promise<{
  rows: UserTableRow[];
  truncated: boolean;
  audience: AudienceSummary;
  unavailable: string[];
}> {
  const admin = createAdminClient();

  const { data: accountPage, error: accountsError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: USER_TABLE_LIMIT,
  });
  if (accountsError) throw accountsError;

  const accounts = (accountPage?.users ?? []).map((user) => ({
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    provider: typeof user.app_metadata?.provider === "string"
      ? user.app_metadata.provider
      : Array.isArray(user.app_metadata?.providers)
        ? user.app_metadata.providers.filter((item): item is string => typeof item === "string").join(", ")
        : null,
  }));

  const audienceFallback: AudienceSummary = {
    anonymousVisitors: 0,
    anonymousNeverLoggedIn: 0,
    anonymousConverted: 0,
    anonymousActiveLast7Days: 0,
  };

  const ids = accounts.map((account) => account.id);
  if (!ids.length) {
    const audienceLoad = await loadAudienceSummary(admin)
      .then((data) => ({ data, unavailable: false }))
      .catch((error) => {
        console.warn("Admin audience telemetry unavailable", error);
        return { data: audienceFallback, unavailable: true };
      });
    return {
      rows: [],
      truncated: false,
      audience: audienceLoad.data,
      unavailable: audienceLoad.unavailable ? ["audience"] : [],
    };
  }

  const [
    profiles,
    activity,
    resumes,
    lanes,
    briefs,
    searches,
    jobs,
    audienceLoad,
  ] = await Promise.all([
    softQuery("profiles", () => admin.from("profiles").select("id,full_name,location,strengths,master_resume,master_resume_text").in("id", ids), []),
    softQuery("activity", () => admin.from("user_activity").select("user_id,last_seen_at,active_seconds,visit_count").in("user_id", ids), []),
    softQuery("resumes", () => admin.from("resume_imports").select("user_id,status,is_master").eq("status", "complete").is("archived_at", null).in("user_id", ids), []),
    softQuery("direction", () => admin.from("target_lanes").select("user_id,weight,active").eq("active", true).in("user_id", ids), []),
    softQuery("search_brief", () => admin.from("search_preferences").select("user_id,country,target_locations,remote_preference,sources").in("user_id", ids), []),
    softQuery("search_results", () => admin.from("search_results").select("user_id,searched_at").in("user_id", ids), []),
    softQuery("jobs", () => admin.from("jobs").select("user_id,status").in("user_id", ids), []),
    loadAudienceSummary(admin)
      .then((data) => ({ data, unavailable: false }))
      .catch((error) => {
        console.warn("Admin audience telemetry unavailable", error);
        return { data: audienceFallback, unavailable: true };
      }),
  ]);

  const unavailable = [
    profiles.unavailable ? "profiles" : null,
    activity.unavailable ? "activity" : null,
    resumes.unavailable ? "resumes" : null,
    lanes.unavailable ? "direction" : null,
    briefs.unavailable ? "search brief" : null,
    searches.unavailable ? "search results" : null,
    jobs.unavailable ? "jobs" : null,
    audienceLoad.unavailable ? "audience" : null,
  ].filter((value): value is string => Boolean(value));

  const audience = audienceLoad.data;

  const resumeUploaded = new Set<string>();
  const masterResumeReady = new Set<string>();
  for (const row of resumes.data) {
    const userId = row.user_id as string;
    resumeUploaded.add(userId);
    if (row.is_master === true) masterResumeReady.add(userId);
  }

  for (const profile of profiles.data) {
    if (profile.master_resume || (typeof profile.master_resume_text === "string" && profile.master_resume_text.trim())) {
      masterResumeReady.add(profile.id as string);
    }
  }

  const laneState = new Map<string, { count: number; weight: number }>();
  for (const lane of lanes.data) {
    const userId = lane.user_id as string;
    const current = laneState.get(userId) ?? { count: 0, weight: 0 };
    current.count += 1;
    current.weight += Number(lane.weight ?? 0);
    laneState.set(userId, current);
  }

  const briefComplete = new Set<string>();
  for (const brief of briefs.data) {
    if (searchBriefComplete({
      country: (brief.country as string | null) ?? null,
      target_locations: brief.target_locations,
      remote_preference: (brief.remote_preference as string | null) ?? null,
      sources: brief.sources,
    })) briefComplete.add(brief.user_id as string);
  }

  const strengthsReady = new Set(
    (profiles.data)
      .filter((profile) => stringArray(profile.strengths).length > 0)
      .map((profile) => profile.id as string),
  );

  const directionComplete = new Set(
    ids.filter((id) => {
      const lane = laneState.get(id);
      return strengthsReady.has(id) && Boolean(lane?.count) && Math.round(lane?.weight ?? 0) === 100;
    }),
  );

  const journeyCompleted = new Set(
    ids.filter((id) => resumeUploaded.has(id) && directionComplete.has(id) && briefComplete.has(id)),
  );

  const searchStarted = new Set(
    (searches.data)
      .filter((row) => Boolean(row.searched_at))
      .map((row) => row.user_id as string),
  );

  const applied = new Set<string>();
  const interviewed = new Set<string>();
  const hired = new Set<string>();
  const savedJobCounts = new Map<string, number>();

  const appliedStatuses = new Set(["applied", "acknowledged", "assessment", "interview", "offer", "hired", "rejected"]);
  const interviewStatuses = new Set(["interview", "offer", "hired"]);

  for (const job of jobs.data) {
    const userId = job.user_id as string;
    const status = String(job.status ?? "");
    savedJobCounts.set(userId, (savedJobCounts.get(userId) ?? 0) + 1);
    if (appliedStatuses.has(status)) applied.add(userId);
    if (interviewStatuses.has(status)) interviewed.add(userId);
    if (status === "hired") hired.add(userId);
  }

  const rows = buildUserTable({
    accounts,
    profiles: (profiles.data).map((profile) => ({
      id: profile.id as string,
      fullName: (profile.full_name as string | null) ?? null,
      location: (profile.location as string | null) ?? null,
    })),
    activity: (activity.data).map((row) => ({
      userId: row.user_id as string,
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
      activeSeconds: Number(row.active_seconds ?? 0),
      visitCount: Number(row.visit_count ?? 0),
    })),
    resumeUploaded,
    masterResumeReady,
    journeyCompleted,
    searchStarted,
    applied,
    interviewed,
    hired,
    savedJobCounts,
  });

  return { rows, truncated: accounts.length >= USER_TABLE_LIMIT, audience, unavailable };
}

async function loadAudienceSummary(admin: ReturnType<typeof createAdminClient>): Promise<AudienceSummary> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [all, never, converted, recent] = await Promise.all([
    admin.from("anonymous_visitors").select("visitor_id", { count: "exact", head: true }),
    admin.from("anonymous_visitors").select("visitor_id", { count: "exact", head: true }).is("converted_user_id", null),
    admin.from("anonymous_visitors").select("visitor_id", { count: "exact", head: true }).not("converted_user_id", "is", null),
    admin.from("anonymous_visitors").select("visitor_id", { count: "exact", head: true }).gte("last_seen_at", weekAgo),
  ]);

  const error = all.error ?? never.error ?? converted.error ?? recent.error;
  if (error) throw error;

  return {
    anonymousVisitors: all.count ?? 0,
    anonymousNeverLoggedIn: never.count ?? 0,
    anonymousConverted: converted.count ?? 0,
    anonymousActiveLast7Days: recent.count ?? 0,
  };
}
