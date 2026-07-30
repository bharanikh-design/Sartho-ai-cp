"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { analyseJobDescription, type JobAnalysis } from "@/lib/matching/analyse-job";
import type { JobRecord } from "@/lib/types";

const recommendationStyles: Record<JobAnalysis["recommendation"], string> = {
  apply: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  review: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  skip: "border-rose-300/30 bg-rose-300/10 text-rose-100",
};

export function JobAnalyser({ initialJobs }: { initialJobs: JobRecord[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [employer, setEmployer] = useState("");
  const [location, setLocation] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analysis = useMemo(
    () => (submittedText ? analyseJobDescription(submittedText) : null),
    [submittedText],
  );

  function analyse() {
    setError(null);
    setSavedJobId(null);
    setSubmittedText(description.trim());
  }

  async function saveJob() {
    if (!analysis || saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, employer, location, sourceUrl, description: submittedText }),
      });
      const result = await response.json() as { job?: JobRecord; error?: string };
      if (!response.ok || !result.job) throw new Error(result.error ?? "Unable to save this job.");
      setSavedJobId(result.job.id);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this job.");
    } finally {
      setSaving(false);
    }
  }

  function clear() {
    setTitle("");
    setEmployer("");
    setLocation("");
    setSourceUrl("");
    setDescription("");
    setSubmittedText("");
    setSavedJobId(null);
    setError(null);
  }

  return (
    <div className="job-workspace-stack">
      <div className="analyser-layout">
        <section className="glass-card analyser-card">
          <div className="card-header">
            <div>
              <h2 className="section-heading">Opportunity input</h2>
              <p className="section-subtitle">Use the complete description so Sartho can see the real responsibilities and constraints.</p>
            </div>
            <span className="meta-pill">Private analysis</span>
          </div>

          <div className="job-meta-grid">
            <label className="analyser-label">Job title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Transition & Transformation Manager" /></label>
            <label className="analyser-label">Employer<input value={employer} onChange={(event) => setEmployer(event.target.value)} placeholder="NTT DATA" /></label>
            <label className="analyser-label">Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore / Remote" /></label>
            <label className="analyser-label">Role link<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Optional source URL" inputMode="url" /></label>
          </div>

          <label className="analyser-label" htmlFor="job-description">Complete job description</label>
          <textarea
            id="job-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="job-textarea"
            placeholder="Paste the role responsibilities, requirements and preferred qualifications here…"
          />

          <div className="action-row">
            <button type="button" onClick={analyse} className="primary-button" disabled={description.trim().length < 40}>
              Analyse role <span aria-hidden="true">↗</span>
            </button>
            <button type="button" onClick={clear} className="secondary-button">Clear</button>
          </div>

          <p className="analyser-note">The first pass is transparent and rule-based. Deep evidence matching is an explicit second action after the role is saved.</p>
        </section>

        <section className="glass-card decision-card" aria-live="polite">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Preliminary decision</div>
              <h2 className="section-heading" style={{ marginTop: 8 }}>Opportunity signal</h2>
            </div>
            {analysis ? <span className="meta-pill">Confidence · {analysis.confidence}</span> : <span className="meta-pill">Awaiting input</span>}
          </div>

          {error ? <div className="inline-error" role="alert">{error}</div> : null}

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

              <div className="analysis-save-row">
                {savedJobId ? (
                  <Link href={`/jobs/${savedJobId}`} className="primary-button">Open saved job <span aria-hidden="true">→</span></Link>
                ) : (
                  <button type="button" className="primary-button" onClick={() => void saveJob()} disabled={saving || !title.trim()}>
                    {saving ? "Saving…" : "Save this job"} <span aria-hidden="true">→</span>
                  </button>
                )}
                <span>Saving preserves the description, decision and next actions.</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="glass-card content-card saved-jobs-section">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Saved jobs</h2>
            <p className="section-subtitle">Reopen any opportunity without re-pasting the job description.</p>
          </div>
          <span className="meta-pill">{initialJobs.length} saved</span>
        </div>

        {initialJobs.length ? (
          <div className="saved-job-list">
            {initialJobs.map((job) => (
              <Link href={`/jobs/${job.id}`} className="saved-job-row" key={job.id}>
                <div>
                  <span className="saved-job-employer">{job.employer ?? "Employer not recorded"}</span>
                  <strong>{job.title}</strong>
                  <small>{job.location ?? "Location not recorded"} · Updated {formatDate(job.updated_at)}</small>
                </div>
                <div className="saved-job-signals">
                  {job.recommendation ? <span className={`status-chip recommendation-${job.recommendation}`}>{job.recommendation}</span> : null}
                  <span className={`status-chip status-${job.status}`}>{job.status}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-inline-state">Your first saved job will appear here.</div>
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
      {values.length ? <div className="chip-row">{values.map((value) => <span key={value} className="signal-chip">{value}</span>)}</div> : <p>{empty}</p>}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
