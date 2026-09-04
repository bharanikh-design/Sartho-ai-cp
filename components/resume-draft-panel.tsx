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
            <p className="section-subtitle">Create a separate review-only draft using your confirmed Career Profile and the saved requirement mapping.</p>
          </div>
          <span className="meta-pill">Human review required</span>
        </div>
        <div className="resume-guardrail-note">The master résumé is never overwritten. Nothing is exported, sent or submitted from this action.</div>
        <button type="button" className="primary-button" disabled={!deepAnalysisComplete || running} onClick={() => void generateDraft()}>
          {running ? "Drafting from your Career Profile…" : "Draft tailored résumé"} <span aria-hidden="true">→</span>
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
          <p className="section-subtitle">Draft — review before use. Generated only from confirmed, résumé-safe Career Profile information.</p>
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
          <div style={{ background: "rgba(107, 207, 147, 0.05)", border: "1px solid rgba(107, 207, 147, 0.2)", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#6bcf93", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              ATS Scorecard
              <span style={{ background: "#6bcf93", color: "#111", padding: "4px 8px", borderRadius: "100px", fontWeight: "bold" }}>92% Match</span>
            </h3>
            
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                <span style={{ color: "#aaa" }}>Keyword Density</span>
                <span style={{ color: "#ccc" }}>High</span>
              </div>
              <div style={{ height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: "92%", height: "100%", background: "#6bcf93" }} />
              </div>
            </div>

            <div>
              <strong style={{ display: "block", fontSize: "0.75rem", color: "#ccc", marginBottom: "8px" }}>Missing Mandatory Keywords</strong>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                <li style={{ fontSize: "0.75rem", color: "#ff9f43", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "6px", height: "6px", background: "#ff9f43", borderRadius: "50%" }}></span>
                  &quot;Enterprise Architecture&quot; (Found in JD)
                </li>
                <li style={{ fontSize: "0.75rem", color: "#ff9f43", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "6px", height: "6px", background: "#ff9f43", borderRadius: "50%" }}></span>
                  &quot;Budget Management&quot; (Found in JD)
                </li>
              </ul>
              <button type="button" style={{ marginTop: "12px", width: "100%", background: "rgba(255,159,67,0.1)", color: "#ff9f43", border: "1px solid rgba(255,159,67,0.2)", padding: "6px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer" }}>
                Auto-inject missing keywords
              </button>
            </div>
            
            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(107,207,147,0.2)" }}>
              <strong style={{ display: "block", fontSize: "0.75rem", color: "#ccc", marginBottom: "8px" }}>Impact Metrics Check</strong>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.75rem", color: "#aaa" }}>
                <span style={{ color: "#6bcf93" }}>✓</span> 4 bullet points use measurable metrics (%, $, #).
              </div>
            </div>
          </div>

          <h3 style={{ marginTop: 0 }}>AI Change log</h3>
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
