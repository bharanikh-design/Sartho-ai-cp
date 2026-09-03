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
  }

  return (
    <div className="job-workspace-stack">
      
      {/* 1. Paste & Analyze Form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
        
        {/* Left Side: Input */}
        <section style={{ padding: "2rem", background: "rgba(255,255,255,0.03)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
          <h2 style={{ fontSize: "1.25rem", margin: "0 0 1.5rem" }}>1. Paste the Job Details</h2>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Job Title<input style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Product Manager" /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Company<input style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={employer} onChange={(event) => setEmployer(event.target.value)} placeholder="e.g. Google" /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Location<input style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore / Remote" /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Link to Job (Optional)<input style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." inputMode="url" /></label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            Full Job Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              style={{ height: "250px", padding: "1rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white", resize: "vertical", fontFamily: "inherit" }}
              placeholder="Copy the entire job description from LinkedIn/Indeed and paste it right here..."
            />
          </label>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button 
              type="button" 
              onClick={analyse} 
              style={{ flex: 1, background: "#0d402b", color: "white", padding: "1rem", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: description.trim().length < 40 ? "not-allowed" : "pointer", opacity: description.trim().length < 40 ? 0.5 : 1, transition: "0.2s" }} 
              disabled={description.trim().length < 40}
            >
              Analyze my fit ⚡️
            </button>
            <button type="button" onClick={clear} style={{ background: "transparent", color: "#888", padding: "1rem 1.5rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>Clear</button>
          </div>
        </section>

        {/* Right Side: Results */}
        <section style={{ padding: "2rem", background: "rgba(255,255,255,0.03)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>2. Sartho's Assessment</h2>
            {analysis ? <span style={{ background: "rgba(255,255,255,0.1)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>Confidence: {analysis.confidence}</span> : <span style={{ background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", color: "#666" }}>Waiting for input...</span>}
          </div>

          {error ? <div style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }} role="alert">{error}</div> : null}

          {!analysis ? (
            <div style={{ color: "#666", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "70%", textAlign: "center", padding: "2rem" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, marginBottom: "1rem" }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <p>Paste a job description on the left and click Analyze.<br/><br/>Sartho will instantly tell you if you're a strong fit for the role based on your Master Resume.</p>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
                <span className={recommendationStyles[analysis.recommendation]} style={{ padding: "6px 16px", borderRadius: "100px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "bold", border: "1px solid", fontSize: "0.875rem" }}>
                  {analysis.recommendation}
                </span>
                <span style={{ fontSize: "0.875rem", color: "#888" }}>Sartho's Verdict</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
                <Result label="Strongest match" value={analysis.primaryStrength ?? "No clear match found"} />
                <Result label="Profile support" value={`${analysis.evidenceBacking}/100`} />
              </div>
              
              <SignalList title="✅ Skills this role requires that YOU have" values={analysis.matchedSignals} empty="No matching skills were found in your Career Profile." />
              <SignalList title="⚠️ Your strengths this role DOES NOT use" values={analysis.cautionSignals} empty="This role calls on all of your strongest skills." />
              
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "1.5rem", marginTop: "2rem" }}>
                <h4 style={{ fontSize: "0.875rem", color: "#aaa", margin: "0 0 1rem" }}>Detailed Analysis</h4>
                <p style={{ lineHeight: 1.6, color: "#e0e0e0", margin: 0 }}>{analysis.explanation}</p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1.5rem" }}>
                {savedJobId ? (
                  <Link href={`/jobs/${savedJobId}`} style={{ background: "#0d402b", color: "white", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>Open saved job <span aria-hidden="true">→</span></Link>
                ) : (
                  <button type="button" onClick={() => void saveJob()} disabled={saving || !title.trim()} style={{ background: "#0d402b", color: "white", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: (saving || !title.trim()) ? "not-allowed" : "pointer", opacity: (saving || !title.trim()) ? 0.5 : 1 }}>
                    {saving ? "Saving…" : "Save to My Opportunities"} <span aria-hidden="true">→</span>
                  </button>
                )}
                <span style={{ fontSize: "0.875rem", color: "#888" }}>{title.trim() ? "Save this job to tailor your resume for it." : "Add a Job Title to save."}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 3. Saved Jobs */}
      {initialJobs.length > 0 && (
        <section style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "2rem", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Saved Opportunities</h2>
              <p style={{ color: "#888", fontSize: "1rem", margin: 0 }}>Jobs you have saved to Sartho. Click any job to tailor your resume for it or track its status.</p>
            </div>
            <span style={{ background: "rgba(255,255,255,0.1)", padding: "6px 16px", borderRadius: "100px", fontSize: "1rem", fontWeight: "bold" }}>{initialJobs.length} Saved</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {initialJobs.map((job) => (
              <Link href={`/jobs/${job.id}`} key={job.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.03)", textDecoration: "none", transition: "0.2s", background: "transparent" }}>
                <div>
                  <span style={{ display: "block", fontSize: "0.875rem", color: "#aaa", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{job.employer ?? "Employer not recorded"}</span>
                  <strong style={{ display: "block", color: "white", fontSize: "1.25rem", marginBottom: "0.25rem" }}>{job.title}</strong>
                  <small style={{ color: "#666", fontSize: "0.875rem" }}>{job.location ?? "Location not recorded"} · Updated {formatDate(job.updated_at)}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {job.recommendation ? <span className={recommendationStyles[job.recommendation]} style={{ padding: "6px 16px", borderRadius: "100px", textTransform: "uppercase", fontSize: "0.75rem", fontWeight: "bold", border: "1px solid" }}>{job.recommendation}</span> : null}
                  <span style={{ padding: "6px 16px", borderRadius: "100px", background: "rgba(255,255,255,0.1)", color: "white", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "bold" }}>{job.status.replace("_", " ")}</span>
                  <span aria-hidden="true" style={{ color: "#888", fontSize: "1.5rem" }}>→</span>
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
      <strong style={{ fontSize: "1.1rem", color: "white" }}>{value}</strong>
    </div>
  );
}

function SignalList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h4 style={{ fontSize: "0.875rem", color: "white", marginBottom: "0.75rem" }}>{title}</h4>
      {values.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {values.map((value) => <span key={value} style={{ background: "rgba(255,255,255,0.1)", color: "white", padding: "6px 12px", borderRadius: "4px", fontSize: "0.875rem" }}>{value}</span>)}
        </div>
      ) : (
        <p style={{ color: "#666", fontSize: "0.875rem", fontStyle: "italic", margin: 0 }}>{empty}</p>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
