"use client";

import { useEffect, useRef, useState } from "react";
import { gateChecks } from "@/lib/resume/ats-gate";
import type { ParseFidelity } from "@/lib/resume/parse-check";
import type { ResumeContent } from "@/lib/resume/content";
import { ResumePdfRenderer } from "@/components/resume-pdf-templates";

/*
 * Does it get past the filters — shown apart from how it ranks.
 *
 * The score answers how a document reads once it is being read. This answers
 * whether it is read at all: the structural checks a parser and a knockout
 * filter apply, and a round trip of the actual files through the parsers the
 * import uses. Blending these into the percentage would hide the one kind of
 * fault that loses interviews outright.
 */

type ParseState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; docx: ParseFidelity; pdf: ParseFidelity | null }
  | { status: "error"; message: string };

const tone: Record<"pass" | "warn" | "fail", string> = { pass: "#6bcf93", warn: "#e0b061", fail: "#e5917a" };

function summarise(name: string, result: ParseFidelity) {
  if (!result.total) return `${name}: could not be read back.`;
  const missing = result.items.filter((item) => !item.found);
  if (result.ok) return `${name}: all ${result.total} facts came back, in order.`;
  return `${name}: ${result.found} of ${result.total} facts came back${result.orderPreserved ? "" : ", roles out of order"}${missing.length ? ` — missing ${missing.slice(0, 4).map((item) => `${item.label.toLowerCase()} "${item.text.slice(0, 40)}"`).join(", ")}${missing.length > 4 ? ` and ${missing.length - 4} more` : ""}` : ""}.`;
}

export function AtsGatePanel({ content, checkKey, compact = false }: {
  content: ResumeContent;
  /** Changes when the document worth checking changes: the draft, the saved version, the template. */
  checkKey: string;
  compact?: boolean;
}) {
  const gate = gateChecks(content);
  const [parse, setParse] = useState<ParseState>({ status: "idle" });
  /* A ref, not state: which key was last checked is bookkeeping, not something the page renders. */
  const checkedKey = useRef<string | null>(null);

  async function runParseCheck(current: ResumeContent) {
    /* Yielding first keeps the state change out of the effect's own tick. */
    await Promise.resolve();
    setParse({ status: "checking" });
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<ResumePdfRenderer content={current} />).toBlob();
      const form = new FormData();
      form.append("content", JSON.stringify(current));
      form.append("pdf", blob, "resume.pdf");
      const response = await fetch("/api/resume/parse-check", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { docx?: ParseFidelity; pdf?: ParseFidelity | null; error?: string };
      if (!response.ok || !result.docx) throw new Error(result.error ?? "Sartho could not read the files back.");
      setParse({ status: "done", docx: result.docx, pdf: result.pdf ?? null });
    } catch (caught) {
      setParse({ status: "error", message: caught instanceof Error ? caught.message : "Sartho could not read the files back." });
    }
  }

  /* Once per document worth checking; edits in progress are checked on demand. */
  useEffect(() => {
    if (checkedKey.current === checkKey) return;
    checkedKey.current = checkKey;
    void runParseCheck(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const failing = gate.checks.filter((check) => check.state === "fail").length;
  const warning = gate.checks.filter((check) => check.state === "warn").length;
  const parseOk = parse.status === "done" ? parse.docx.ok && (parse.pdf?.ok ?? true) : null;

  return (
    <div className={`studio-gate${compact ? " is-compact" : ""}`}>
      <div className="studio-gate-head">
        <strong>
          <span style={{ color: tone[failing ? "fail" : warning || parseOk === false ? "warn" : "pass"] }} aria-hidden="true">
            {failing || parseOk === false ? "×" : warning ? "!" : "✓"}
          </span>{" "}
          {failing ? "Would be filtered out" : parseOk === false ? "Files lose facts when parsed" : warning ? "Passes filters, with notes" : "Passes filters"}
        </strong>
        <small>
          {failing ? `${failing} blocking` : ""}{failing && warning ? " · " : ""}{warning ? `${warning} to look at` : ""}
          {!failing && !warning ? "Reachable, dated, in order, standard sections" : ""}
        </small>
      </div>

      {compact ? null : (
        <ul className="studio-ats-checks">
          {gate.checks.map((check) => (
            <li key={check.label}>
              <details>
                <summary>
                  <span style={{ color: tone[check.state] }} aria-hidden="true">{check.state === "pass" ? "✓" : check.state === "warn" ? "!" : "×"}</span>
                  {check.label}
                </summary>
                <small>{check.detail}</small>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="studio-gate-parse">
        {parse.status === "checking" ? <small>Reading the Word and PDF files back through the parser…</small> : null}
        {parse.status === "error" ? <small className="is-error">{parse.message}</small> : null}
        {parse.status === "done" ? (
          <>
            <small style={{ color: parse.docx.ok ? tone.pass : tone.warn }}>{summarise("Word", parse.docx)}</small>
            {parse.pdf ? <small style={{ color: parse.pdf.ok ? tone.pass : tone.warn }}>{summarise("PDF", parse.pdf)}</small> : null}
          </>
        ) : null}
        {parse.status !== "checking" ? (
          <button type="button" className="chip-button" onClick={() => void runParseCheck(content)}>
            {parse.status === "idle" ? "Check the files parse" : "Re-check with current edits"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
