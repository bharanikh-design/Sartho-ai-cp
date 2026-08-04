"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * The way a career gets into Sartho.
 *
 * Deliberately says what it will and will not do before anyone commits a file:
 * nothing extracted here is used anywhere until it has been read and approved,
 * and saying so up front is the difference between a tool that reads your
 * résumé and one that quietly speaks for you.
 */

type Result = {
  rolesCreated: number;
  evidenceCreated: number;
  evidenceSkipped: number;
};

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export function ResumeImport({ hasEvidence }: { hasEvidence: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/career/import", { method: "POST", body });
      const payload = (await response.json()) as Partial<Result> & { error?: string };

      if (!response.ok) throw new Error(payload.error ?? "The import failed.");

      setResult({
        rolesCreated: payload.rolesCreated ?? 0,
        evidenceCreated: payload.evidenceCreated ?? 0,
        evidenceSkipped: payload.evidenceSkipped ?? 0,
      });
      // Brings the newly extracted claims into the review list below.
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="resume-import">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="resume-import-input"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <div className="resume-import-body">
        <p className="resume-import-lead">
          {hasEvidence
            ? "Add another résumé and Sartho will read it for anything new. Claims you have already reviewed are left exactly as you left them."
            : "Upload your résumé and Sartho will read every role and achievement out of it. Nothing it finds is used anywhere until you have approved it."}
        </p>

        <button
          type="button"
          className="review-button is-primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? `Reading ${fileName ?? "your résumé"}…` : hasEvidence ? "Upload another résumé" : "Upload your résumé"}
        </button>

        <p className="resume-import-note">PDF, Word (.docx) or plain text, up to 8MB.</p>
      </div>

      {busy ? (
        <p className="resume-import-status" role="status">
          Reading the document and pulling out every role and claim. This usually takes under a minute.
        </p>
      ) : null}

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      {result ? (
        <div className="resume-import-result" role="status">
          <strong>
            {result.evidenceCreated
              ? `${result.evidenceCreated} claim${result.evidenceCreated === 1 ? "" : "s"} ready for your review`
              : "Nothing new in that one"}
          </strong>
          <span>
            {result.rolesCreated ? `${result.rolesCreated} role${result.rolesCreated === 1 ? "" : "s"} added. ` : ""}
            {result.evidenceSkipped
              ? `${result.evidenceSkipped} already in your profile, left untouched.`
              : "Approve or reject each one below."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
