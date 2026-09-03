"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { analyseJobDescription, type JobAnalysis } from "@/lib/matching/analyse-job";
import type { SkillProfile } from "@/lib/matching/skill-profile";
import type { JobRecord } from "@/lib/types";

const recommendationStyles: Record<JobAnalysis["recommendation"], string> = {
  apply: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  review: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  skip: "border-rose-300/30 bg-rose-300/10 text-rose-100",
};

export function JobAnalyser({ initialJobs, skillProfile }: { initialJobs: JobRecord[]; skillProfile: SkillProfile }) {
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
  const [isTyping, setIsTyping] = useState(false);

  const analysis = useMemo(
    () => (submittedText ? analyseJobDescription(submittedText, skillProfile) : null),
    [submittedText, skillProfile],
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
    setIsTyping(false);
  }

  const showEmptyState = initialJobs.length === 0 && !isTyping && !description.trim();

  return (
    <div className="job-workspace-stack" style={{ maxWidth: "1200px", margin: "0 auto" }}>
      
      {showEmptyState ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: "16px", marginBottom: "2rem" }}>
          <div style={{ width: "64px", height: "64px", background: "rgba(13,64,43,0.2)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6bcf93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Your Command Center Awaits</h2>
          <p style={{ color: "#888", maxWidth: "500px", margin: "0 auto 2rem", lineHeight: 1.6 }}>Sartho doesn't scrape job boards. Instead, you find the roles you love on LinkedIn or Indeed, and paste them here. Sartho's AI will deeply analyze your fit and automatically tailor your resume.</p>
          <button 
            type="button" 
            onClick={() => setIsTyping(true)}
            style={{ background: "#0d402b", color: "white", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", transition: "0.2s" }}
          >
            Paste your first Job Description
          </button>
        </div>
      ) : (
        <div className="analyser-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
          <section className="glass-card analyser-card" style={{ padding: "2rem", background: "rgba(255,255,255,0.03)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>Opportunity input</h2>
              <p style={{ color: "#888", fontSize: "0.875rem" }}>Use the complete description so Sartho can see the real responsibilities and constraints.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Job title<input style={{ padding: "0.6rem 1rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Product Manager" /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Employer<input style={{ padding: "0.6rem 1rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={employer} onChange={(event) => setEmployer(event.target.value)} placeholder="e.g. Google" /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Location<input style={{ padding: "0.6rem 1rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore / Remote" /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Role link<input style={{ padding: "0.6rem 1rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." inputMode="url" /></label>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              Complete job description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                style={{ height: "200px", padding: "1rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white", resize: "vertical", fontFamily: "inherit" }}
                placeholder="Paste the role responsibilities, requirements and preferred qualifications here…"
              />
            </label>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button type="button" onClick={analyse} style={{ background: "#0d402b", color: "white", padding: "0.8rem 1.5rem", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: description.trim().length < 40 ? "not-allowed" : "pointer", opacity: description.trim().length < 40 ? 0.5 : 1 }} disabled={description.trim().length < 40}>
                Analyse role <span aria-hidden="true">↗</span>
              </button>
              <button type="button" onClick={clear} style={{ background: "transparent", color: "#888", padding: "0.8rem 1.5rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>Clear</button>
            </div>
          </section>

          <section className="glass-card decision-card" aria-live="polite" style={{ padding: "2rem", background: "rgba(255,255,255,0.03)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: "0.25rem" }}>Preliminary decision</div>
                <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Opportunity signal</h2>
              </div>
              {analysis ? <span style={{ background: "rgba(255,255,255,0.1)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>Confidence · {analysis.confidence}</span> : <span style={{ background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#666" }}>Awaiting input</span>}
            </div>

            {error ? <div style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }} role="alert">{error}</div> : null}

            {!analysis ? (
              <div style={{ color: "#666", display: "flex", alignItems: "center", justifyContent: "center", height: "60%", textAlign: "center", padding: "2rem" }}>
                <p>Paste a complete job description on the left to instantly assess your leadership fit, career-lane alignment, and technical match.</p>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
                  <span className={recommendationStyles[analysis.recommendation]} style={{ padding: "4px 12px", borderRadius: "100px", textTransform: "capitalize", fontWeight: "bold", border: "1px solid", fontSize: "0.875rem" }}>{analysis.recommendation}</span>
                  <span style={{ fontSize: "0.75rem", color: "#888" }}>Sartho recommendation</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
                  <Result label="Strongest match" value={analysis.primaryStrength ?? "No clear match found"} />
                  <Result label="Profile support" value={`${analysis.evidenceBacking}/100`} />
                </div>
                
                <SignalList title="Your skills this role asks for" values={analysis.matchedSignals} empty="No matching skills were found in your Career Profile." />
                <SignalList title="Your strengths it does not use" values={analysis.cautionSignals} empty="This role calls on all of your strongest skills." />
                
                <p style={{ lineHeight: 1.6, color: "#ccc", margin: "2rem 0", padding: "1rem", background: "rgba(255,255,255,0.05)", borderRadius: "8px" }}>{analysis.explanation}</p>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1.5rem" }}>
                  {savedJobId ? (
                    <Link href={`/jobs/${savedJobId}`} style={{ background: "#0d402b", color: "white", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Open saved job <span aria-hidden="true">→</span></Link>
                  ) : (
                    <button type="button" onClick={() => void saveJob()} disabled={saving || !title.trim()} style={{ background: "#0d402b", color: "white", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: (saving || !title.trim()) ? "not-allowed" : "pointer", opacity: (saving || !title.trim()) ? 0.5 : 1 }}>
                      {saving ? "Saving…" : "Save this job"} <span aria-hidden="true">→</span>
                    </button>
                  )}
                  <span style={{ fontSize: "0.75rem", color: "#888" }}>{title.trim() ? "Saving preserves this analysis." : "Add a Job Title to save."}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {initialJobs.length > 0 && (
        <section className="glass-card content-card saved-jobs-section" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.25rem" }}>Saved Opportunities</h2>
              <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>Reopen any opportunity to tailor a resume or track the application.</p>
            </div>
            <span style={{ background: "rgba(255,255,255,0.1)", padding: "4px 12px", borderRadius: "100px", fontSize: "0.875rem" }}>{initialJobs.length} saved</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {initialJobs.map((job) => (
              <Link href={`/jobs/${job.id}`} key={job.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.03)", textDecoration: "none", transition: "0.2s", background: "transparent" }}>
                <div>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "#888", marginBottom: "0.25rem" }}>{job.employer ?? "Employer not recorded"}</span>
                  <strong style={{ display: "block", color: "white", fontSize: "1.1rem", marginBottom: "0.25rem" }}>{job.title}</strong>
                  <small style={{ color: "#666" }}>{job.location ?? "Location not recorded"} · Updated {formatDate(job.updated_at)}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {job.recommendation ? <span className={recommendationStyles[job.recommendation]} style={{ padding: "4px 12px", borderRadius: "100px", textTransform: "capitalize", fontSize: "0.75rem", border: "1px solid" }}>{job.recommendation}</span> : null}
                  <span style={{ padding: "4px 12px", borderRadius: "100px", background: "rgba(255,255,255,0.1)", color: "white", fontSize: "0.75rem", textTransform: "capitalize" }}>{job.status.replace("_", " ")}</span>
                  <span aria-hidden="true" style={{ color: "#888" }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", padding: "1rem", borderRadius: "8px" }}>
      <span style={{ display: "block", fontSize: "0.75rem", color: "#888", marginBottom: "0.25rem" }}>{label}</span>
      <strong style={{ fontSize: "1.1rem" }}>{value}</strong>
    </div>
  );
}

function SignalList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h4 style={{ fontSize: "0.875rem", color: "#aaa", marginBottom: "0.75rem" }}>{title}</h4>
      {values.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {values.map((value) => <span key={value} style={{ background: "rgba(255,255,255,0.1)", padding: "4px 10px", borderRadius: "4px", fontSize: "0.875rem" }}>{value}</span>)}
        </div>
      ) : (
        <p style={{ color: "#666", fontSize: "0.875rem", fontStyle: "italic" }}>{empty}</p>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
