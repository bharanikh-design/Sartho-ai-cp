"use client";

import { useState } from "react";

/*
 * "Find it in my Drive."
 *
 * The problem this solves is not uploading — uploading is easy. It is that
 * almost nobody knows which of their files is the current CV. There is a
 * Resume_final_v3.docx somewhere, one a recruiter edited, and a Google Doc
 * from eighteen months ago, and "upload your résumé" makes that somebody
 * else's archaeology at the worst possible moment.
 *
 * So the list leads with when each file was last edited, in words, because
 * that is the fact people are missing. Sartho never picks: choosing wrongly
 * and building a job search on the wrong CV would be worse than asking.
 */

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  sizeBytes: number | null;
  isGoogleDoc: boolean;
  folder: string | null;
};

/*
 * "3 days ago" rather than a timestamp. The question in somebody's head is
 * "which is the newest", and a date makes them do the subtraction themselves.
 */
export function describeAge(modifiedTime: string, now = Date.now()): string {
  const at = Date.parse(modifiedTime);
  if (!Number.isFinite(at)) return "date unknown";
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return "edited today";
  if (days === 1) return "edited yesterday";
  if (days < 30) return `edited ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `edited ${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `edited ${years} year${years === 1 ? "" : "s"} ago`;
}

export function DriveResumePicker({
  connected,
  onImported,
}: {
  connected: boolean;
  /** Handed the same payload the file picker produces, so import runs unchanged. */
  onImported: (upload: { objectPath: string; fileName: string; mimeType: string; byteSize: number }) => void;
}) {
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy("search");
    setError(null);
    try {
      const response = await fetch("/api/integrations/google/resumes");
      const result = await response.json() as { files?: DriveFile[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not search your Drive.");
      setFiles(result.files ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not search your Drive.");
    } finally {
      setBusy(null);
    }
  }

  async function choose(file: DriveFile) {
    setBusy(file.id);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, fileName: file.name, isGoogleDoc: file.isGoogleDoc }),
      });
      const result = await response.json() as { objectPath?: string; fileName?: string; mimeType?: string; byteSize?: number; error?: string };
      if (!response.ok || !result.objectPath) throw new Error(result.error ?? "Sartho could not read that file.");
      onImported({
        objectPath: result.objectPath,
        fileName: result.fileName ?? file.name,
        mimeType: result.mimeType ?? file.mimeType,
        byteSize: result.byteSize ?? 0,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not read that file.");
    } finally {
      setBusy(null);
    }
  }

  if (!connected) {
    return (
      <p className="drive-picker-hint">
        Not sure which file is the latest? <a href="/integrations">Connect Google Drive</a> and Sartho will find your
        résumés and show you when each was last edited.
      </p>
    );
  }

  return (
    <div className="drive-picker">
      {files === null ? (
        <button type="button" className="secondary-button" onClick={() => void search()} disabled={busy !== null}>
          {busy === "search" ? "Looking…" : "Find it in my Drive"}
        </button>
      ) : files.length === 0 ? (
        <p className="drive-picker-hint">
          Nothing in your Drive is named like a résumé. Upload the file instead, or rename it and{" "}
          <button type="button" className="drive-picker-link" onClick={() => void search()}>look again</button>.
        </p>
      ) : (
        <>
          <p className="drive-picker-hint">
            {/*
              * Said out loud, because "newest" is a claim and somebody is about
              * to act on it. Sartho is ordering by Drive's modified time, not
              * judging which CV is best.
              */}
            Newest first, by when Drive says each was last edited. Pick the one you want to work from.
          </p>
          <ul className="drive-picker-list">
            {files.map((file, index) => (
              <li key={file.id}>
                <div className="drive-picker-file">
                  <strong>{file.name}</strong>
                  <span>
                    {describeAge(file.modifiedTime)}
                    {file.folder ? ` · ${file.folder}` : ""}
                    {file.isGoogleDoc ? " · Google Doc" : ""}
                    {index === 0 ? " · most recent" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className={index === 0 ? "primary-button" : "secondary-button"}
                  onClick={() => void choose(file)}
                  disabled={busy !== null}
                >
                  {busy === file.id ? "Reading…" : "Use this"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </div>
  );
}
