"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DriveResumePicker } from "@/components/drive-resume-picker";
import { ResumeProgress, type ImportProgress } from "@/components/resume-progress";
import { readProgressEvents } from "@/lib/resume/progress-stream";
import {
  detectKind,
  makeResumeObjectPath,
  MAX_UPLOAD_BYTES,
  normaliseResumeMimeType,
  RESUME_ACCEPT,
  RESUME_UPLOAD_BUCKET,
} from "@/lib/resume/upload";
import { createClient } from "@/lib/supabase";

/*
 * The way a career gets into Sartho.
 *
 * Deliberately says what it will and will not do before anyone commits a file:
 * nothing extracted here is used anywhere until it has been read and approved,
 * and saying so up front is the difference between a tool that reads your
 * résumé and one that quietly speaks for you.
 *
 * This is the only "upload your résumé" control in the product. Anywhere that
 * offers to take a résumé renders this — a second control wearing the same
 * words but only linking here is a button that lies about what it does.
 */

type Result = {
  rolesCreated: number;
  evidenceCreated: number;
  evidenceSkipped: number;
};

export function ResumeImport({
  hasEvidence,
  showLead = true,
  continueHref,
  driveConnected = false,
}: {
  hasEvidence: boolean;
  /**
   * Whether Google Drive is connected, decided on the server.
   *
   * Passed in rather than fetched here so the picker does not flash a
   * "connect Drive" prompt at somebody who connected it last week while a
   * request goes out to find that out.
   */
  driveConnected?: boolean;
  /** Off where the surrounding page already makes the same promise. */
  showLead?: boolean;
  /*
   * Where the review lives, when it is not on this page.
   *
   * Without it the component assumes the claims land underneath and simply
   * refreshes. With it, refreshing would be wrong: the page that offered the
   * upload is usually an empty state, so re-rendering it against the evidence
   * that now exists replaces the result with something else entirely, and the
   * person is left wondering where their résumé went.
   */
  continueHref?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please upload one under 8MB.`);
      return;
    }
    const kind = detectKind(file.name, file.type);
    if (!kind) {
      setError("Sartho reads PDF, Word (.docx) and plain text résumés.");
      return;
    }
    const mimeType = normaliseResumeMimeType(kind, file.type);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Your session has expired. Please sign in again.");
      return;
    }

    const objectPath = makeResumeObjectPath(user.id, file.name);
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    setProgress({ stage: "extracted", fileName: file.name, characters: 0, sample: "", roles: 0, claims: 0 });

    const { error: uploadError } = await supabase.storage
      .from(RESUME_UPLOAD_BUCKET)
      .upload(objectPath, file, { contentType: mimeType, upsert: false });
    if (uploadError) {
      setError("The résumé could not be uploaded securely. Please try again.");
      setBusy(false);
      setProgress(null);
      return;
    }

    await runImport({ objectPath, fileName: file.name, mimeType, byteSize: file.size });
  }

  /*
   * Everything after the bytes are in the bucket.
   *
   * Split out so a file from Google Drive walks the same path as one dropped
   * on the page. The Drive route lands its download in the same bucket, at the
   * same owned path, and hands back the same four fields — so there is one
   * import pipeline with one streaming progress display, rather than a second
   * copy that drifts.
   */
  async function runImport(upload: { objectPath: string; fileName: string; mimeType: string; byteSize: number }) {
    const objectPath = upload.objectPath;
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(upload.fileName);
    setProgress({ stage: "extracted", fileName: upload.fileName, characters: 0, sample: "", roles: 0, claims: 0 });

    try {
      const response = await fetch("/api/career/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectPath,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          byteSize: upload.byteSize,
        }),
      });

      /*
       * Anything that could fail fast still fails as JSON with a real status.
       * Only the long part streams, so both shapes have to be handled.
       */
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "The import failed.");
      }
      if (!response.body) throw new Error("The import failed.");

      let finished: Result | null = null;

      await readProgressEvents(response.body, (event) => {
        if (event.stage === "error") throw new Error(event.error);

        if (event.stage === "done") {
          finished = {
            rolesCreated: event.rolesCreated,
            evidenceCreated: event.evidenceCreated,
            evidenceSkipped: event.evidenceSkipped,
          };
        }

        setProgress((current) => {
          if (!current) return current;
          if (event.stage === "extracted") {
            return { ...current, stage: "extracted", characters: event.characters, sample: event.sample };
          }
          if (event.stage === "reading") return { ...current, stage: "reading" };
          if (event.stage === "saving") {
            return { ...current, stage: "saving", roles: event.roles, claims: event.claims };
          }
          return { ...current, stage: "done" };
        });
      });

      if (!finished) throw new Error("The import ended before it finished.");

      setResult(finished);
      window.dispatchEvent(new Event("sartho:journey-changed"));
      // Brings the newly extracted claims into the review list below. Where the
      // review is on another page, the result and its link have to survive.
      if (!continueHref) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import failed.");
    } finally {
      // The API removes the object after extraction. This second, idempotent
      // cleanup covers a lost request or a browser/network failure before then.
      {
        try {
          await supabase.storage.from(RESUME_UPLOAD_BUCKET).remove([objectPath]);
        } catch {
          // The API normally removed it already. A failed best-effort retry must
          // not leave the interface stuck in its busy state.
        }
      }
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !busy) void upload(file);
  }

  return (
    <div
      className={`resume-import${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="resume-import-body">
        {showLead ? (
          <p className="resume-import-lead">
            {hasEvidence
              ? "Add another résumé and Sartho will read it for anything new. Everything already captured is left exactly as it is."
              : "Upload your résumé and Sartho will read every role and achievement out of it, straight into your approved career evidence."}
          </p>
        ) : null}

        {/*
          * A label wrapping the input, not a button that calls .click() on a
          * hidden one. Programmatic clicks on file inputs are blocked or
          * ignored by several browsers, which leaves a button that visibly
          * does nothing — and a file picker is exactly what a label for a file
          * input opens natively, with no JavaScript in the path at all.
          */}
        <label className={`resume-import-trigger${busy ? " is-busy" : ""}`}>
          <input
            ref={inputRef}
            type="file"
            accept={RESUME_ACCEPT}
            className="resume-import-input"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {busy ? `Reading ${fileName ?? "your résumé"}…` : hasEvidence ? "Upload another résumé" : "Upload your résumé"}
        </label>

        <p className="resume-import-note">
          PDF, Word (.docx) or plain text, up to 8MB. You can also drop a file anywhere in this box.
        </p>

        {/*
          * The other way in, and for most people the better one: almost nobody
          * knows which of their files is the current CV. Placed here, under the
          * upload button, because this is the moment somebody is standing in
          * front of that question — not on a settings page they would have to
          * think to visit.
          */}
        {busy ? null : (
          <DriveResumePicker connected={driveConnected} onImported={(upload) => void runImport(upload)} />
        )}
      </div>

      {progress ? <ResumeProgress progress={progress} /> : null}

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      {result ? (
        <div className="resume-import-result" role="status">
          <strong>
            {result.evidenceCreated
              ? "Your career evidence is ready"
              : "Nothing new in that one"}
          </strong>
          <span>
            {result.rolesCreated ? `${result.rolesCreated} role${result.rolesCreated === 1 ? "" : "s"} added. ` : ""}
            {result.evidenceSkipped
              ? "Existing details were kept and new information was reconciled."
              : `${result.evidenceCreated} career fact${result.evidenceCreated === 1 ? "" : "s"} approved and ready to use.`}
          </span>

          {/*
            * The label is built from what actually happened rather than passed
            * in, so it cannot promise claims to review when none were found.
            */}
          {continueHref ? (
            <Link href={continueHref} className="resume-import-continue">
              {result.evidenceCreated
                ? "Choose your career direction"
                : "Continue"}
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
