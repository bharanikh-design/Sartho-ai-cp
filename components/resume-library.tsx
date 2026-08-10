import type { ResumeImportRecord } from "@/lib/data/career";
import { describeAiFailure } from "@/lib/ai/failure";

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

  const usable = imports.filter((item) => item.status !== "failed");
  const failures = imports.filter((item) => item.status === "failed");
  const uniqueFailures = failures.filter((item, index) =>
    failures.findIndex((candidate) => candidate.file_name.toLocaleLowerCase() === item.file_name.toLocaleLowerCase()) === index
  );

  return (
    <div className="resume-library-grouped">
      {failures.length ? (
        <details className="resume-import-issues">
          <summary><span><strong>{failures.length} import attempt{failures.length === 1 ? "" : "s"} need attention</strong><small>Collapsed so failed attempts do not overwhelm your usable résumés.</small></span><span>Review issue{uniqueFailures.length === 1 ? "" : "s"}</span></summary>
          <div className="resume-import-issue-list">
            {uniqueFailures.map((item) => (
              <article key={item.id}>
                <div><strong>{item.label ?? item.file_name}</strong><small>{when(item.created_at)}{size(item.byte_size) ? ` · ${size(item.byte_size)}` : ""}</small></div>
                <p>{item.error ? describeAiFailure(item.error) : "Sartho could not read this résumé. Try uploading it again."}</p>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {usable.length ? <ul className="library">
        {usable.map((item) => (
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
          ) : (
            <span className="library-result">Reading…</span>
          )}
        </li>
        ))}
      </ul> : null}
    </div>
  );
}
