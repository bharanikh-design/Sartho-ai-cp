import { createAdminClient } from "@/lib/supabase/admin";
import { buildUserTable, type UserTableRow } from "@/lib/analytics/user-table";

/*
 * Everything the operator table needs, in a fixed number of queries.
 *
 * Seven round trips whatever the user count, rather than six per person. The
 * per-person version would have been simpler to write and would have worked
 * beautifully for the handful of accounts it was tested against, then taken
 * the page down at a few hundred.
 *
 * Reads through the service role, because two of these are not readable any
 * other way: auth.users is not exposed to a signed-in client at all, and every
 * other table is behind a row-level policy that correctly restricts a person to
 * their own rows. Called only from a page that has already checked the caller
 * is an operator.
 */

/** A page of accounts. Deliberately capped: this is a table, not an export. */
export const USER_TABLE_LIMIT = 500;

export async function loadUserTable(): Promise<{ rows: UserTableRow[]; truncated: boolean }> {
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
  }));

  const ids = accounts.map((account) => account.id);
  if (!ids.length) return { rows: [], truncated: false };

  /*
   * Scoped to the accounts on this page rather than fetching whole tables, so
   * the query cost tracks the page and not the lifetime size of the product.
   */
  const [profiles, activity, resumes, lanes, briefs, notifications] = await Promise.all([
    admin.from("profiles").select("id,full_name,location").in("id", ids),
    admin.from("user_activity").select("user_id,last_seen_at,active_seconds,visit_count").in("user_id", ids),
    /* A completed import, not an attempted one — a failed upload is not a CV. */
    admin.from("resume_imports").select("user_id").eq("status", "complete").in("user_id", ids),
    /* An active target lane is what Career Direction produces. */
    admin.from("target_lanes").select("user_id").eq("active", true).in("user_id", ids),
    /* A saved brief means they got as far as describing what they want. */
    admin.from("search_preferences").select("user_id").in("user_id", ids),
    admin
      .from("notification_preferences")
      .select("user_id,daily_digest_enabled,match_alerts_enabled")
      .in("user_id", ids),
  ]);

  const idsFrom = (result: { data: Array<{ user_id: string }> | null }): Set<string> =>
    new Set((result.data ?? []).map((row) => row.user_id));

  const rows = buildUserTable({
    accounts,
    profiles: (profiles.data ?? []).map((profile) => ({
      id: profile.id as string,
      fullName: (profile.full_name as string | null) ?? null,
      location: (profile.location as string | null) ?? null,
    })),
    activity: (activity.data ?? []).map((row) => ({
      userId: row.user_id as string,
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
      activeSeconds: Number(row.active_seconds ?? 0),
      visitCount: Number(row.visit_count ?? 0),
    })),
    resumeUploaded: idsFrom(resumes),
    directionComplete: idsFrom(lanes),
    searchStarted: idsFrom(briefs),
    /* Either email counts as opting in; the question is whether Sartho may write to them. */
    notificationsOn: new Set(
      (notifications.data ?? [])
        .filter((row) => row.daily_digest_enabled || row.match_alerts_enabled)
        .map((row) => row.user_id as string),
    ),
  });

  return { rows, truncated: accounts.length >= USER_TABLE_LIMIT };
}
