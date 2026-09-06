import { FUNNEL_STEPS, type UserTableRow } from "@/lib/analytics/user-table";

/*
 * Who has signed up, how far they got, and whether they are still here.
 *
 * Read top to bottom it answers one question — is anybody using this — and the
 * columns are ordered to answer it: who they are, when they arrived, when they
 * were last here, how long they have spent, and how far through the product
 * they got.
 *
 * Two honesty rules run through it. Nothing is invented: a person with no
 * profile shows a dash rather than a guess at their name. And "last active"
 * says which kind of reading it is — a measured one, or a last sign-in, which
 * for anybody with a live session can be months stale.
 */

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(date);
}

export function UserActivityTable({ rows, truncated }: { rows: UserTableRow[]; truncated: boolean }) {
  if (!rows.length) {
    return (
      <div className="empty-inline-state">
        Nobody has signed up yet. This table fills itself in as people arrive — there is nothing to configure.
      </div>
    );
  }

  return (
    <>
      <div className="user-table-scroll">
        <table className="user-table">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Location</th>
              <th scope="col">First signed up</th>
              <th scope="col">Last active</th>
              <th scope="col">Active time</th>
              <th scope="col">Visits</th>
              <th scope="col">Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <small>{row.email}</small>
                </td>
                <td>{row.location}</td>
                <td>{formatDate(row.firstSeenAt)}</td>
                <td>
                  {formatDate(row.lastActiveAt)}
                  {/*
                    * Said out loud. A session lasts weeks, so a sign-in date
                    * shown as "last active" would flatter every user who has
                    * not signed out — which is most of them.
                    */}
                  {row.lastActiveAt && !row.lastActiveIsMeasured ? <small>last sign-in, not measured</small> : null}
                </td>
                <td>{row.activeTime}</td>
                <td>{row.visitCount || "—"}</td>
                <td>
                  <span className="user-table-funnel" aria-label={`${row.progress} of ${FUNNEL_STEPS.length} steps complete`}>
                    {([row.resumeUploaded, row.directionComplete, row.searchStarted, row.notificationsOn]).map((done, index) => (
                      <span
                        key={FUNNEL_STEPS[index]}
                        className={`user-table-step${done ? " is-done" : ""}`}
                        title={`${FUNNEL_STEPS[index]}: ${done ? "done" : "not yet"}`}
                      >
                        {FUNNEL_STEPS[index]}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="diagnostic-note">
        Active time is measured only while Sartho is open and in the foreground, and a gap longer
        than a minute earns nothing — so a tab left open overnight counts as nothing, and the
        figure is an undercount rather than an overcount.
        {truncated ? " Showing the most recent 500 accounts." : ""}
      </p>
    </>
  );
}
