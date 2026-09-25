import { FUNNEL_STEPS, type UserTableRow } from "@/lib/analytics/user-table";

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
    return <div className="empty-inline-state">Nobody has signed up yet.</div>;
  }

  return (
    <>
      <div className="user-table-scroll">
        <table className="user-table">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Location</th>
              <th scope="col">Signed up</th>
              <th scope="col">Last active</th>
              <th scope="col">Time</th>
              <th scope="col">Avg / visit</th>
              <th scope="col">Visits</th>
              <th scope="col">Jobs</th>
              <th scope="col">Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const lifecycle = [
                row.resumeUploaded,
                row.masterResumeReady,
                row.journeyCompleted,
                row.searchStarted,
                row.applied,
                row.interviewed,
                row.hired,
              ];

              return (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                    <small>{row.provider}</small>
                  </td>
                  <td>{row.location}</td>
                  <td>{formatDate(row.firstSeenAt)}</td>
                  <td>
                    {formatDate(row.lastActiveAt)}
                    {row.lastActiveAt && !row.lastActiveIsMeasured
                      ? <small>last sign-in, not measured activity</small>
                      : null}
                  </td>
                  <td>{row.activeTime}</td>
                  <td>{row.averageVisitTime}</td>
                  <td>{row.visitCount || "—"}</td>
                  <td>{row.savedJobs || "—"}</td>
                  <td>
                    <span className="user-table-funnel" aria-label={row.progress + " of " + FUNNEL_STEPS.length + " lifecycle milestones reached"}>
                      {lifecycle.map((done, index) => (
                        <span
                          key={FUNNEL_STEPS[index]}
                          className={"user-table-step" + (done ? " is-done" : "")}
                          title={FUNNEL_STEPS[index] + ": " + (done ? "done" : "not yet")}
                        >
                          {FUNNEL_STEPS[index]}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="diagnostic-note">
        Active time is measured only while Sartho is visible in the foreground. Average/visit is
        measured active time divided by observed visits, so both figures deliberately under-count
        rather than credit idle tabs.
        {truncated ? " Showing the first 500 accounts returned by Supabase Auth." : ""}
      </p>
    </>
  );
}