"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationRecord } from "@/lib/types";

export function ResumeDraftPanel({
  jobId,
  deepAnalysisComplete,
  application,
}: {
  jobId: string;
  deepAnalysisComplete: boolean;
  application: ApplicationRecord | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateDraft() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to draft the résumé.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to draft the résumé.");
    } finally {
      setRunning(false);
    }
  }

  async function copyDraft() {
    if (!application?.resume_draft) return;
    await navigator.clipboard.writeText(application.resume_draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!application?.resume_draft) {
    return (
      <section className="glass-card content-card resume-generate-card">
        <div className="card-header">
          <div>
            <div className="page-eyebrow">Résumé Studio</div>
            <h2 className="section-heading">Draft a tailored résumé</h2>
            <p className="section-subtitle">Create a separate review-only draft using approved evidence and the persisted requirement mapping.</p>
          </div>
          <span className="meta-pill">Human review required</span>
        </div>
        <div className="resume-guardrail-note">The master résumé is never overwritten. Nothing is exported, sent or submitted from this action.</div>
        <button type="button" className="primary-button" disabled={!deepAnalysisComplete || running} onClick={() => void generateDraft()}>
          {running ? "Drafting from approved evidence…" : "Draft tailored résumé"} <span aria-hidden="true">→</span>
        </button>
        {!deepAnalysisComplete ? <p className="field-hint">Complete deep analysis first.</p> : null}
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
      </section>
    );
  }

  return (
    <section className="glass-card content-card resume-output-card">
      <div className="card-header">
        <div>
          <div className="page-eyebrow">Résumé Studio</div>
          <h2 className="section-heading">{application.resume_version ?? "Tailored résumé draft"}</h2>
          <p className="section-subtitle">Draft — review before use. Generated only from approved résumé-safe evidence.</p>
        </div>
        <div className="resume-output-actions">
          <button type="button" className="secondary-button" onClick={() => void copyDraft()}>{copied ? "Copied" : "Copy draft"}</button>
          <button type="button" className="secondary-button" onClick={() => void generateDraft()} disabled={running}>{running ? "Redrafting…" : "Redraft"}</button>
        </div>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <div className="resume-review-grid">
        <article className="resume-draft-reader">
          <div className="resume-draft-label">DRAFT — REVIEW BEFORE USE</div>
          <pre>{application.resume_draft}</pre>
        </article>
        <aside className="resume-change-log">
          <h3>Change log</h3>
          <p>Every material emphasis, rewording, omission or movement is recorded here.</p>
          {application.resume_change_log.length ? (
            <ol>
              {application.resume_change_log.map((change, index) => (
                <li key={`${change.type}-${index}`}>
                  <span>{change.type}</span>
                  <strong>{change.description}</strong>
                  <small>{change.evidenceIds.length} evidence citation{change.evidenceIds.length === 1 ? "" : "s"}</small>
                </li>
              ))}
            </ol>
          ) : <div className="empty-inline-state">No change-log entries were stored.</div>}
        </aside>
      </div>
    </section>
  );
}
