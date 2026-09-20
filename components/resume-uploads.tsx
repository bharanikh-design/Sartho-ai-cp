"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResumeImportRecord } from "@/lib/data/career";
import { describeAiFailure } from "@/lib/ai/failure";

/*
 * The résumés somebody has uploaded, each as a row, on the page they uploaded
 * them from.
 *
 * An upload used to vanish on arrival: the file was deleted once its text was
 * read, the row that recorded it lived on another page, and Résumé Studio
 * showed only the documents Sartho had written. Somebody who had just handed
 * over their CV had nothing on screen to prove it, and nothing to say which
 * one of several was the master.
 *
 * Every row here can be opened to show the text exactly as it was read from
 * the file — no tidying, no shortening — and downloaded as the original file,
 * so the two can be put side by side. One row can be flagged as the master.
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

type Opened = { text: string; characterCount: number | null };

export function ResumeUploads({ imports }: { imports: ResumeImportRecord[] }) {
  const router = useRouter();
  /* The text of each opened row, fetched once and kept. */
  const [opened, setOpened] = useState<Record<string, Opened>>({});
  const [showing, setShowing] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  /*
   * Which row is the master right now.
   *
   * The server's answer, with a local override so the badge moves the moment
   * the flag is set rather than when the refresh lands. The override remembers
   * what the server said when it was made, and drops itself once the server
   * says something else — so a later upload flagged as master, arriving by a
   * refresh, is not shouted down by a stale click.
   */
  const serverMaster = imports.find((item) => item.is_master)?.id ?? null;
  const [override, setOverride] = useState<{ id: string; seen: string | null } | null>(null);
  const masterId = override && override.seen === serverMaster ? override.id : serverMaster;
  const [error, setError] = useState<string | null>(null);

  if (!imports.length) {
    return <div className="empty-inline-state">No résumés uploaded yet. The first one you upload appears here, exactly as you gave it.</div>;
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
    } finally {
      setLoadingId(null);
    }
  }

  async function makeMaster(item: ResumeImportRecord) {
    if (markingId) return;
    setMarkingId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/career/imports/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMaster: true }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not mark that résumé as your master.");
      setOverride({ id: item.id, seen: serverMaster });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not mark that résumé as your master.");
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="resume-uploads">
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      <ul className="library">
        {imports.map((item) => {
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
                  {item.character_count ? ` · ${item.character_count.toLocaleString("en-GB")} characters kept` : ""}
                  {item.status === "complete"
                    ? ` · ${item.evidence_created} claim${item.evidence_created === 1 ? "" : "s"} read`
                    : item.status === "failed"
                      ? " · reading failed"
                      : " · reading…"}
                </span>
              </div>

              {/*
                * The flag. A radio in all but shape: pressing it on one row
                * clears it on every other, because there is one master.
                */}
              <div className="library-actions">
                <button
                  type="button"
                  className={`chip-button${isMaster ? " is-selected" : ""}`}
                  aria-pressed={isMaster}
                  disabled={isMaster || markingId !== null}
                  onClick={() => void makeMaster(item)}
                  title={isMaster ? "This is your master résumé" : "Make this your master résumé"}
                >
                  {isMaster ? "Master résumé" : markingId === item.id ? "Marking…" : "Make master"}
                </button>
                <button
                  type="button"
                  className="chip-button"
                  aria-expanded={open}
                  onClick={() => void toggleText(item)}
                >
                  {loadingId === item.id ? "Opening…" : open ? "Hide text" : "View text"}
                </button>
                {item.object_path ? (
                  <a className="chip-button" href={`/api/career/imports/${item.id}/file`} download={item.file_name}>
                    Download original
                  </a>
                ) : (
                  <span className="library-meta" title="Uploaded before originals were kept. Only its text is available.">
                    Original not kept
                  </span>
                )}
              </div>

              {item.status === "failed" ? (
                <span className="library-result is-failed">
                  {item.error ? describeAiFailure(item.error) : "Sartho could not read this résumé."}
                  {" "}The document itself is kept; only the reading of it failed.
                </span>
              ) : null}

              {open && text ? (
                <div className="resume-upload-text">
                  <small>
                    {text.text.length.toLocaleString("en-GB")} characters, exactly as read from the file.
                    {text.characterCount !== null && text.characterCount !== text.text.length
                      ? ` (The row recorded ${text.characterCount.toLocaleString("en-GB")}.)`
                      : ""}
                  </small>
                  <pre>{text.text}</pre>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
