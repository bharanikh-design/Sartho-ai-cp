import type { ResumeImportRecord } from "@/lib/data/career";

/*
 * Every résumé this account has handed over, kept.
 *
 * These rows used to be a log — proof an upload happened, with the document
 * itself discarded. Keeping the text turns the same list into a repository:
 * a claim can point at the résumé it came from, a newer CV can be compared
 * against an older one, and the extraction can be run again later without
 * asking someone to go and find the file.
 */

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function size(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ResumeLibrary({ imports }: { imports: ResumeImportRecord[] }) {
  if (!imports.length) {
    return <div className="empty-inline-state">No résumés yet. The first one you upload is kept here.</div>;
  }

  return (
    <ul className="library">
      {imports.map((item) => (
        <li key={item.id} className={`library-row is-${item.status}`}>
          <div className="library-main">
            <strong className="library-name">{item.label ?? item.file_name}</strong>
            <span className="library-meta">
              {when(item.created_at)}
              {size(item.byte_size) ? ` · ${size(item.byte_size)}` : ""}
              {item.character_count ? ` · ${item.character_count.toLocaleString("en-GB")} characters read` : ""}
            </span>
          </div>

          {item.status === "complete" ? (
            <span className="library-result">
              {item.evidence_created} claim{item.evidence_created === 1 ? "" : "s"}
              {item.roles_created ? `, ${item.roles_created} role${item.roles_created === 1 ? "" : "s"}` : ""}
              {item.evidence_skipped ? ` · ${item.evidence_skipped} already held` : ""}
            </span>
          ) : item.status === "failed" ? (
            <span className="library-result is-failed">{item.error ?? "Could not be read"}</span>
          ) : (
            <span className="library-result">Reading…</span>
          )}
        </li>
      ))}
    </ul>
  );
}
