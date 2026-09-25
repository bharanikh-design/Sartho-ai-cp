import { describeDuration } from "@/lib/analytics/activity";

export type UserAccount = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  provider: string | null;
};

export type UserActivityRow = {
  userId: string;
  lastSeenAt: string | null;
  activeSeconds: number;
  visitCount: number;
};

export type UserProfileRow = {
  id: string;
  fullName: string | null;
  location: string | null;
};

export type UserTableInput = {
  accounts: UserAccount[];
  profiles: UserProfileRow[];
  activity: UserActivityRow[];
  resumeUploaded: Set<string>;
  masterResumeReady: Set<string>;
  journeyCompleted: Set<string>;
  searchStarted: Set<string>;
  applied: Set<string>;
  interviewed: Set<string>;
  hired: Set<string>;
  savedJobCounts: Map<string, number>;
};

export type UserTableRow = {
  id: string;
  name: string;
  email: string;
  location: string;
  provider: string;
  firstSeenAt: string | null;
  lastActiveAt: string | null;
  lastActiveIsMeasured: boolean;
  activeSeconds: number;
  activeTime: string;
  averageVisitSeconds: number;
  averageVisitTime: string;
  visitCount: number;
  savedJobs: number;
  resumeUploaded: boolean;
  masterResumeReady: boolean;
  journeyCompleted: boolean;
  searchStarted: boolean;
  applied: boolean;
  interviewed: boolean;
  hired: boolean;
  progress: number;
};

export const FUNNEL_STEPS = [
  "Résumé",
  "Master",
  "Journey",
  "Search",
  "Applied",
  "Interview",
  "Hired",
] as const;

export function buildUserTable(input: UserTableInput): UserTableRow[] {
  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const activityById = new Map(input.activity.map((row) => [row.userId, row]));

  return input.accounts.map((account): UserTableRow => {
    const profile = profileById.get(account.id);
    const activity = activityById.get(account.id);
    const activeSeconds = Math.max(0, Math.floor(activity?.activeSeconds ?? 0));
    const visitCount = Math.max(0, Math.floor(activity?.visitCount ?? 0));
    const averageVisitSeconds = visitCount ? Math.round(activeSeconds / visitCount) : 0;
    const measured = Boolean(activity?.lastSeenAt);

    const steps = [
      input.resumeUploaded.has(account.id),
      input.masterResumeReady.has(account.id),
      input.journeyCompleted.has(account.id),
      input.searchStarted.has(account.id),
      input.applied.has(account.id),
      input.interviewed.has(account.id),
      input.hired.has(account.id),
    ];

    return {
      id: account.id,
      name: profile?.fullName?.trim() || "—",
      email: account.email?.trim() || "—",
      location: profile?.location?.trim() || "—",
      provider: account.provider?.trim() || "—",
      firstSeenAt: account.createdAt,
      lastActiveAt: measured ? activity!.lastSeenAt : account.lastSignInAt,
      lastActiveIsMeasured: measured,
      activeSeconds,
      activeTime: describeDuration(activeSeconds),
      averageVisitSeconds,
      averageVisitTime: describeDuration(averageVisitSeconds),
      visitCount,
      savedJobs: input.savedJobCounts.get(account.id) ?? 0,
      resumeUploaded: steps[0],
      masterResumeReady: steps[1],
      journeyCompleted: steps[2],
      searchStarted: steps[3],
      applied: steps[4],
      interviewed: steps[5],
      hired: steps[6],
      progress: steps.filter(Boolean).length,
    };
  }).sort((a, b) => time(b.lastActiveAt) - time(a.lastActiveAt));
}

function time(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summariseUserTable(rows: UserTableRow[], now = new Date()) {
  const activeSince = (days: number) => {
    const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
    return rows.filter((row) => time(row.lastActiveAt) >= cutoff).length;
  };

  const totalActiveSeconds = rows.reduce((sum, row) => sum + row.activeSeconds, 0);
  const totalVisits = rows.reduce((sum, row) => sum + row.visitCount, 0);

  return {
    total: rows.length,
    activeLast7Days: activeSince(7),
    activeLast30Days: activeSince(30),
    averageActiveSeconds: rows.length ? Math.round(totalActiveSeconds / rows.length) : 0,
    averageActiveTime: describeDuration(rows.length ? Math.round(totalActiveSeconds / rows.length) : 0),
    averageVisitSeconds: totalVisits ? Math.round(totalActiveSeconds / totalVisits) : 0,
    averageVisitTime: describeDuration(totalVisits ? Math.round(totalActiveSeconds / totalVisits) : 0),
    resumeUploaded: rows.filter((row) => row.resumeUploaded).length,
    masterResumeReady: rows.filter((row) => row.masterResumeReady).length,
    journeyCompleted: rows.filter((row) => row.journeyCompleted).length,
    searchStarted: rows.filter((row) => row.searchStarted).length,
    applied: rows.filter((row) => row.applied).length,
    interviewed: rows.filter((row) => row.interviewed).length,
    hired: rows.filter((row) => row.hired).length,
  };
}
