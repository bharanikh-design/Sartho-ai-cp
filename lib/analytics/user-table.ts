import { describeDuration } from "@/lib/analytics/activity";

/*
 * One row per person, for the operator table.
 *
 * The shape of the problem is that almost none of this needs storing: how far
 * somebody got is already written down in whether their rows exist. A completed
 * résumé import means they uploaded a CV. An active target lane means they
 * finished Career Direction. A saved brief means they started searching. Adding
 * a "has_uploaded_resume" flag beside those would be a second copy of a fact
 * that can disagree with the first, and it would be wrong for everybody who
 * signed up before the flag existed.
 *
 * So the funnel is derived, and the join happens here rather than in the page.
 * It is done with sets rather than per-person queries on purpose: a table of a
 * thousand people built by asking six questions each is six thousand round
 * trips, and it would work perfectly for the twenty users it was tested with.
 */

export type UserAccount = {
  id: string;
  email: string | null;
  /** When the account was created — the first sign-in, in practice. */
  createdAt: string | null;
  /** The last time they authenticated, which is NOT the last time they were here. */
  lastSignInAt: string | null;
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
  /** User ids that have each signal. Sets, so the join is one pass. */
  resumeUploaded: Set<string>;
  directionComplete: Set<string>;
  searchStarted: Set<string>;
  notificationsOn: Set<string>;
};

export type UserTableRow = {
  id: string;
  name: string;
  email: string;
  location: string;
  firstSeenAt: string | null;
  lastActiveAt: string | null;
  /** Whether lastActiveAt is a real activity reading or only a sign-in. */
  lastActiveIsMeasured: boolean;
  activeSeconds: number;
  activeTime: string;
  visitCount: number;
  resumeUploaded: boolean;
  directionComplete: boolean;
  searchStarted: boolean;
  notificationsOn: boolean;
  /** 0–4: how many of the four steps they have completed. */
  progress: number;
};

/** The four things the funnel is made of, in the order somebody does them. */
export const FUNNEL_STEPS = ["Résumé", "Direction", "Search", "Alerts"] as const;

export function buildUserTable(input: UserTableInput): UserTableRow[] {
  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const activityById = new Map(input.activity.map((row) => [row.userId, row]));

  const rows = input.accounts.map((account): UserTableRow => {
    const profile = profileById.get(account.id);
    const activity = activityById.get(account.id);

    const resumeUploaded = input.resumeUploaded.has(account.id);
    const directionComplete = input.directionComplete.has(account.id);
    const searchStarted = input.searchStarted.has(account.id);
    const notificationsOn = input.notificationsOn.has(account.id);

    /*
     * Measured activity when there is any, and the last sign-in otherwise —
     * flagged, because they are different claims. Sessions persist for weeks,
     * so a sign-in date presented as "last active" would be wrong in the
     * flattering direction for everybody who has not signed out.
     */
    const measured = Boolean(activity?.lastSeenAt);
    const activeSeconds = Math.max(0, Math.floor(activity?.activeSeconds ?? 0));

    return {
      id: account.id,
      /* Never invented. An account with no profile has not uploaded a CV yet. */
      name: profile?.fullName?.trim() || "—",
      email: account.email?.trim() || "—",
      location: profile?.location?.trim() || "—",
      firstSeenAt: account.createdAt,
      lastActiveAt: measured ? activity!.lastSeenAt : account.lastSignInAt,
      lastActiveIsMeasured: measured,
      activeSeconds,
      activeTime: describeDuration(activeSeconds),
      visitCount: Math.max(0, Math.floor(activity?.visitCount ?? 0)),
      resumeUploaded,
      directionComplete,
      searchStarted,
      notificationsOn,
      progress: [resumeUploaded, directionComplete, searchStarted, notificationsOn].filter(Boolean).length,
    };
  });

  /*
   * Most recently active first. That is the question an operator opens this to
   * answer — who is still here — and a row with no reading at all sorts last
   * rather than to an arbitrary place.
   */
  return rows.sort((a, b) => time(b.lastActiveAt) - time(a.lastActiveAt));
}

function time(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Headline counts, so the table has something above it worth reading. */
export function summariseUserTable(rows: UserTableRow[], now = new Date()) {
  const activeSince = (days: number) => {
    const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
    return rows.filter((row) => time(row.lastActiveAt) >= cutoff).length;
  };

  return {
    total: rows.length,
    activeLast7Days: activeSince(7),
    activeLast30Days: activeSince(30),
    resumeUploaded: rows.filter((row) => row.resumeUploaded).length,
    directionComplete: rows.filter((row) => row.directionComplete).length,
    searchStarted: rows.filter((row) => row.searchStarted).length,
    notificationsOn: rows.filter((row) => row.notificationsOn).length,
    /* Everybody who finished all four. The number the product is actually for. */
    fullyActivated: rows.filter((row) => row.progress === 4).length,
  };
}
