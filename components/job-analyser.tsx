"use client";

import { useMemo, useState } from "react";
import { analyseJobDescription, type JobAnalysis } from "@/lib/matching/analyse-job";

const recommendationStyles: Record<JobAnalysis["recommendation"], string> = {
  apply: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  review: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  skip: "border-rose-300/30 bg-rose-300/10 text-rose-100",
};

export function JobAnalyser() {
  const [description, setDescription] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const analysis = useMemo(
    () => (submittedText ? analyseJobDescription(submittedText) : null),
    [submittedText],
  );

  return (
    <div className="analyser-layout">
      <section className="glass-card analyser-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Opportunity input</h2>
            <p className="section-subtitle">Use the complete description so Sartho can see the real responsibilities and constraints.</p>
          </div>
          <span className="meta-pill">Private analysis</span>
        </div>

        <div className="input-mode-bar" aria-label="Job input method">
          <button type="button" className="input-mode is-active">Job description</button>
          <button type="button" className="input-mode" disabled>Job link · soon</button>
        </div>

        <label className="analyser-label" htmlFor="job-description">Complete job description</label>
        <textarea
          id="job-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="job-textarea"
          placeholder="Paste the role title, responsibilities, requirements and preferred qualifications here…"
        />

        <div className="action-row">
          <button
            type="button"
            onClick={() => setSubmittedText(description)}
            className="primary-button disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!description.trim()}
          >
            Analyse role <span aria-hidden="true">↗</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDescription("");
              setSubmittedText("");
            }}
            className="secondary-button"
          >
            Clear
          </button>
        </div>

        <p className="analyser-note">
          This build uses transparent rule-based screening. Evidence-led AI matching follows after your Career Truth approval.
        </p>
      </section>

      <section className="glass-card decision-card" aria-live="polite">
        <div className="card-header">
          <div>
            <div className="page-eyebrow">Preliminary decision</div>
            <h2 className="section-heading" style={{ marginTop: 8 }}>Opportunity signal</h2>
          </div>
          {analysis ? <span className="meta-pill">Confidence · {analysis.confidence}</span> : <span className="meta-pill">Awaiting input</span>}
        </div>

        {!analysis ? (
          <div className="empty-decision">
            <span className="empty-decision-icon" aria-hidden="true">◎</span>
            <h3>Your analysis will appear here</h3>
            <p>Paste a complete job description to assess leadership fit, career-lane alignment and technical heaviness.</p>
          </div>
        ) : (
          <div className="decision-result">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`decision-badge ${recommendationStyles[analysis.recommendation]}`}>{analysis.recommendation}</span>
              <span className="muted text-xs">Sartho recommendation</span>
            </div>

            <Result label="Best-fit lane" value={analysis.primaryLane} />
            <Result label="Technical heaviness" value={`${analysis.technicalHeaviness}/100`} />

            <SignalList title="Relevant signals" values={analysis.matchedSignals} empty="No strong lane signals detected." />
            <SignalList title="Caution signals" values={analysis.cautionSignals} empty="No material technical or support-heavy warning detected." />

            <p className="analysis-explanation">{analysis.explanation}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return <div className="result-tile"><span>{label}</span><strong>{value}</strong></div>;
}

function SignalList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div className="signal-section">
      <h4>{title}</h4>
      {values.length ? (
        <div className="chip-row">
          {values.map((value) => <span key={value} className="signal-chip">{value}</span>)}
        </div>
      ) : <p>{empty}</p>}
    </div>
  );
}
