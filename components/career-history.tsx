import type { CareerRoleRecord, EvidenceRecord } from "@/lib/types";

/*
 * The career, in order.
 *
 * Roles were being extracted, stored and then never shown — they existed only
 * as a caption on an evidence card. A career read one claim at a time is not a
 * career, and the shape of it is the first thing anyone reading a résumé looks
 * at: where, for how long, and doing what.
 */

function formatMonth(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function period(role: CareerRoleRecord) {
  const start = formatMonth(role.start_date);
  const end = role.is_current ? "Present" : formatMonth(role.end_date);
  if (!start && !end) return "Dates not recorded";
  return `${start ?? "?"} — ${end ?? "?"}`;
}

export function CareerHistory({
  roles,
  evidence,
}: {
  roles: CareerRoleRecord[];
  evidence: EvidenceRecord[];
}) {
  if (!roles.length) {
    return (
      <div className="empty-inline-state">
        No roles have been recorded yet. Uploading a résumé fills this in.
      </div>
    );
  }

  const highlightsByRole = new Map<string, number>();
  for (const item of evidence) {
    if (item.approval_status === "rejected" || !item.career_role_id) continue;
    highlightsByRole.set(item.career_role_id, (highlightsByRole.get(item.career_role_id) ?? 0) + 1);
  }

  const ordered = roles.slice().sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return (b.start_date ?? "").localeCompare(a.start_date ?? "");
  });

  return (
    <ol className="history">
      {ordered.map((role) => {
        const highlights = highlightsByRole.get(role.id) ?? 0;
        return (
          <li key={role.id} className={`history-role${role.is_current ? " is-current" : ""}`}>
            <div className="history-marker" aria-hidden="true" />
            <div className="history-body">
              <div className="history-head">
                <strong>{role.title}</strong>
                <span className="history-period">{period(role)}</span>
              </div>
              <p className="history-employer">
                {role.employer}
                {role.location ? ` · ${role.location}` : ""}
              </p>
              {role.summary ? <p className="history-summary">{role.summary}</p> : null}
              <span className="history-count">
                {highlights
                  ? `${highlights} career highlight${highlights === 1 ? "" : "s"}`
                  : "No career highlights captured from this role"}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
