"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ResumeProgress, type ImportProgress } from "@/components/resume-progress";
import { readProgressEvents } from "@/lib/resume/progress-stream";

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

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export function ResumeImport({
  hasEvidence,
  showLead = true,
  continueHref,
}: {
  hasEvidence: boolean;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    setProgress({ stage: "extracted", fileName: file.name, characters: 0, sample: "", roles: 0, claims: 0 });

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/career/import", { method: "POST", body });

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
      // Brings the newly extracted claims into the review list below. Where the
      // review is on another page, the result and its link have to survive.
      if (!continueHref) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import failed.");
    } finally {
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
              ? "Add another résumé and Sartho will read it for anything new. Claims you have already reviewed are left exactly as you left them."
              : "Upload your résumé and Sartho will read every role and achievement out of it. Nothing it finds is used anywhere until you have approved it."}
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
            accept={ACCEPT}
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
      </div>

      {progress ? <ResumeProgress progress={progress} /> : null}

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
              : continueHref
                ? "Nothing is used anywhere until you approve it."
                : "Approve or reject each one below."}
          </span>

          {/*
            * The label is built from what actually happened rather than passed
            * in, so it cannot promise claims to review when none were found.
            */}
          {continueHref ? (
            <Link href={continueHref} className="resume-import-continue">
              {result.evidenceCreated
                ? `Review ${result.evidenceCreated} claim${result.evidenceCreated === 1 ? "" : "s"}`
                : "Open your Career Profile"}
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
