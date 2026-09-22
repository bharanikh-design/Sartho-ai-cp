"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResumeImportRecord } from "@/lib/data/career";
import { describeAiFailure } from "@/lib/ai/failure";

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function size(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function normaliseName(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

/*
 * The source-document shelf, not an upload log.
 *
 * A retry or re-upload must not turn into another permanent card. We collapse
 * identical source identities in the UI while retaining every database row for
 * audit/history. The master always wins its group; otherwise the newest usable
 * copy wins. Failed attempts are one collapsed system issue, not a red panel
 * repeated beside every document.
 */
function sourceKey(item: ResumeImportRecord) {
  return [normaliseName(item.file_name), item.byte_size ?? "", item.character_count ?? ""].join(":");
}

type Opened = { text: string; characterCount: number | null };

export function ResumeUploads({
  imports,
  studioSourceId = null,
  onOpenInStudio,
}: {
  imports: ResumeImportRecord[];
  studioSourceId?: string | null;
  onOpenInStudio?: (item: ResumeImportRecord, alreadyBuilt: boolean) => Promise<void> | void;
}) {
  const router = useRouter();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, Opened>>({});
  const [showing, setShowing] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serverMaster = imports.find((item) => item.is_master)?.id ?? null;
  const [override, setOverride] = useState<{ id: string; seen: string | null } | null>(null);
  const masterId = override && override.seen === serverMaster ? override.id : serverMaster;

  const { visible, hiddenCount, failures } = useMemo(() => {
    const failed = imports.filter((item) => item.status === "failed");
    const usable = imports.filter((item) => item.status !== "failed");
    const groups = new Map<string, ResumeImportRecord[]>();
    for (const item of usable) {
      const key = sourceKey(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const rows = [...groups.values()].map((group) =>
      group.find((item) => item.id === masterId) ??
      [...group].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    ).sort((a, b) => {
      if (a.id === masterId) return -1;
      if (b.id === masterId) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return { visible: rows, hiddenCount: usable.length - rows.length, failures: failed };
  }, [imports, masterId]);

  if (!imports.length) {
    return <div className="empty-inline-state">No source résumés yet. Upload one résumé to establish your master.</div>;
  }

  async function toggleText(item: ResumeImportRecord) {
    if (showing === item.id) { setShowing(null); return; }
    setShowing(item.id);
    if (opened[item.id]) return;
    setLoadingId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/career/imports/${item.id}`);
      const result = await response.json() as { text?: string; characterCount?: number | null; error?: string };
      if (!response.ok || typeof result.text !== "string") throw new Error(result.error ?? "Sartho could not read that résumé.");
      setOpened((state) => ({ ...state, [item.id]: { text: result.text as string, characterCount: result.characterCount ?? null } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not read that résumé.");
      setShowing(null);
    } finally { setLoadingId(null); }
  }

  async function makeMaster(item: ResumeImportRecord) {
    if (markingId) return;
    setMarkingId(item.id); setError(null);
    try {
      const response = await fetch(`/api/career/imports/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isMaster: true }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not mark that résumé as your master.");
      setOverride({ id: item.id, seen: serverMaster });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not mark that résumé as your master.");
    } finally { setMarkingId(null); }
  }

  async function deleteItem(item: ResumeImportRecord) {
    if (deletingId || !window.confirm(`Delete ${item.file_name}?`)) return;
    setDeletingId(item.id); setError(null);
    try {
      const response = await fetch(`/api/career/imports/${item.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not delete that résumé.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not delete that résumé.");
    } finally { setDeletingId(null); }
  }

  const uniqueFailureMessages = [...new Set(failures.map((item) => item.error ? describeAiFailure(item.error) : "Sartho could not analyse a source résumé."))];

  return (
    <div className="resume-uploads">
      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      {failures.length ? (
        <details className="resume-import-issues">
          <summary>
            <span><strong>Some source analysis needs attention</strong><small>Your documents are safe. This does not create extra résumé cards.</small></span>
            <span>{failures.length} attempt{failures.length === 1 ? "" : "s"}</span>
          </summary>
          <div className="resume-import-issue-list">
            {uniqueFailureMessages.map((message) => <p key={message}>{message} Your document is preserved; retry analysis when the provider is available.</p>)}
          </div>
        </details>
      ) : null}

      <ul className="library">
        {visible.map((item) => {
          const isMaster = masterId === item.id;
          const open = showing === item.id;
          const text = opened[item.id];
          return (
            <li key={item.id} className={`library-row is-${item.status}${isMaster ? " is-master" : ""}`}>
              <div className="library-main">
                <strong className="library-name">
                  {item.label ?? item.file_name}
                  {isMaster ? <em className="studio-draft-badge">Master</em> : null}
                </strong>
                <span className="library-meta">
                  {when(item.created_at)}
                  {size(item.byte_size) ? ` · ${size(item.byte_size)}` : ""}
                  {item.character_count ? ` · ${item.character_count.toLocaleString("en-GB")} characters` : ""}
                  {item.status === "complete" ? ` · ${item.evidence_created} claims read` : " · analysing…"}
                </span>
              </div>

              <div className="library-actions">
                {isMaster && onOpenInStudio ? (
                  <button type="button" className="chip-button is-primary" disabled={openingId !== null}
                    onClick={async () => { setOpeningId(item.id); try { await onOpenInStudio(item, studioSourceId === item.id); } finally { setOpeningId(null); } }}>
                    {openingId === item.id ? "Opening…" : studioSourceId === item.id ? "Open in Studio" : "Edit in Studio"}
                  </button>
                ) : null}
                <button type="button" className={`chip-button${isMaster ? " is-selected" : ""}`} aria-pressed={isMaster}
                  disabled={isMaster || markingId !== null} onClick={() => void makeMaster(item)}>
                  {isMaster ? "Master résumé" : markingId === item.id ? "Marking…" : "Make master"}
                </button>
                <button type="button" className="chip-button" aria-expanded={open} onClick={() => void toggleText(item)}>
                  {loadingId === item.id ? "Opening…" : open ? "Hide text" : "View text"}
                </button>
                {item.object_path ? <a className="chip-button" href={`/api/career/imports/${item.id}/file`} download={item.file_name}>Download</a> : null}
                <button type="button" className="chip-button" disabled={deletingId === item.id || isMaster}
                  onClick={() => void deleteItem(item)} title={isMaster ? "Choose another master before deleting this source" : "Delete source"}>
                  {deletingId === item.id ? "Deleting…" : "Delete"}
                </button>
              </div>

              {open && text ? (
                <div className="resume-upload-text">
                  <small>{text.text.length.toLocaleString("en-GB")} characters, exactly as read from the file.</small>
                  <pre>{text.text}</pre>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 ? (
        <details className="resume-import-issues">
          <summary><span><strong>{hiddenCount} duplicate upload{hiddenCount === 1 ? "" : "s"} collapsed</strong><small>Kept in history; not repeated in your working library.</small></span><span>History</span></summary>
        </details>
      ) : null}
    </div>
  );
}
