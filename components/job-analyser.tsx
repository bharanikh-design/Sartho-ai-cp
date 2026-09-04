"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { JobAnalysis } from "@/lib/matching/analyse-job";
import type { SkillProfile } from "@/lib/matching/skill-profile";
import type { JobRecord } from "@/lib/types";

const recommendationStyles: Record<JobAnalysis["recommendation"], string> = {
  apply: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  review: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  skip: "border-rose-300/30 bg-rose-300/10 text-rose-100",
};

// The scored analysis the preview endpoint returns — the exact same object the
// save persists, so what you see here is what gets stored.
type PreviewAnalysis = JobAnalysis & { primaryLane?: string };

export function JobAnalyser({ initialJobs, skillProfile }: { initialJobs: JobRecord[]; skillProfile?: SkillProfile }) {
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
  const [extensionIntel, setExtensionIntel] = useState<{ applicants?: string; postedDate?: string; hiringManager?: string } | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === "sartho-extension" && event.data?.type === "IMPORT_JOB") {
        const payload = event.data.payload;
        setTitle(payload.title || "");
        setEmployer(payload.company || "");
        setSourceUrl(payload.url || "");
        setDescription(payload.description || "");
        
        // Save Extension Intel
        if (payload.applicants || payload.postedDate || payload.hiringManager) {
          setExtensionIntel({
            applicants: payload.applicants,
            postedDate: payload.postedDate,
            hiringManager: payload.hiringManager
          });
        }
        
        // Auto trigger analyze if there is a description
        if (payload.description) {
          setTimeout(() => {
            const analyzeBtn = document.getElementById("analyze-fit-btn");
            if (analyzeBtn) analyzeBtn.click();
          }, 500);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);


  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<PreviewAnalysis | null>(null);
  const [overallMatch, setOverallMatch] = useState<number | null>(null);

  async function analyse() {
    if (!description.trim()) return;
    setError(null);
    setSavedJobId(null);
    setAnalysis(null);
    setOverallMatch(null);
    setSubmittedText(description.trim());
    setIsAnalyzing(true);

    try {
      // Same scorer the save uses, so this preview is exactly what gets stored.
      const res = await fetch("/api/jobs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });

      const data = await res.json() as { analysis?: PreviewAnalysis; overallMatch?: number; error?: string };
      if (!res.ok || !data.analysis) throw new Error(data.error || "Analysis failed");

      setAnalysis(data.analysis);
      setOverallMatch(data.overallMatch ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to analyze job");
    } finally {
      setIsAnalyzing(false);
    }
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
    setAnalysis(null);
    setOverallMatch(null);
    setIsAnalyzing(false);
  }

  return (
    <div className="job-workspace-stack">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
        
        {/* Left Side: Input */}
        <section className="glass-card" style={{ padding: "2rem" }}>
          <h2 className="section-heading" style={{ marginBottom: "1.5rem" }}>1. Paste the Job Details</h2>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Job Title<input className="sartho-input" style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Product Manager" /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Company<input className="sartho-input" style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={employer} onChange={(event) => setEmployer(event.target.value)} placeholder="e.g. Google" /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Location<input className="sartho-input" style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore / Remote" /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem" }}>Link to Job (Optional)<input className="sartho-input" style={{ padding: "0.8rem", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "white" }} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." inputMode="url" /></label>
          </div>

          
  {extensionIntel && (
    <div style={{ marginBottom: "1.5rem", padding: "12px 16px", background: "rgba(107, 207, 147, 0.05)", border: "1px solid rgba(107, 207, 147, 0.2)", borderRadius: "8px" }}>
      <h4 style={{ margin: "0 0 8px 0", fontSize: "0.75rem", color: "#6bcf93", textTransform: "uppercase", letterSpacing: "0.05em" }}>LinkedIn Opportunity Details</h4>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {extensionIntel.applicants && extensionIntel.applicants !== "hidden" && (
          <span style={{ fontSize: "0.8125rem", color: "#ccc" }}>👥 {extensionIntel.applicants}</span>
        )}
        {extensionIntel.postedDate && (
          <span style={{ fontSize: "0.8125rem", color: "#ccc" }}>🗓 {extensionIntel.postedDate}</span>
        )}
        {extensionIntel.hiringManager && (
          <span style={{ fontSize: "0.8125rem", color: "#ccc" }}>👤 <strong>Hiring Manager:</strong> {extensionIntel.hiringManager}</span>
        )}
      </div>
    </div>
  )}
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
              id="analyze-fit-btn" onClick={analyse} 
              className="primary-button"
              style={{ flex: 1, padding: "1rem", fontSize: "1rem" }} 
              disabled={isAnalyzing || description.trim().length < 40}
            >
              {isAnalyzing ? "Processing..." : "Analyze my fit ⚡️"}
            </button>
            <button type="button" onClick={clear} className="secondary-button" style={{ padding: "1rem 1.5rem" }}>Clear</button>
          </div>
        </section>

        {/* Right Side: Parallel Processing Results */}
        <section className="glass-card" style={{ padding: "2rem", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h2 className="section-heading" style={{ margin: 0 }}>2. Sartho&apos;s Assessment</h2>
            {isAnalyzing && <span className="meta-pill" style={{ background: "rgba(107, 207, 147, 0.2)", color: "#6bcf93", border: "1px solid #6bcf93" }}>Analysing…</span>}
          </div>

          {error ? <div className="inline-error" role="alert">{error}</div> : null}

          {!analysis && !isAnalyzing ? (
            <div style={{ color: "#666", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "2rem" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, marginBottom: "1rem" }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <p>Paste a job description and click Analyze.<br/><br/>Sartho maps the role&apos;s requirements against the career evidence you approved, and shows the match with the evidence behind it.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              
              {/* Stream 1: Semantic Graph Matching */}
              {analysis && (
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(107, 207, 147, 0.3)", borderRadius: "8px", padding: "1.5rem", animation: "fade-in 0.5s ease-out" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <h4 style={{ margin: 0, color: "white", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#6bcf93" }}>✦</span> Fit against your evidence
                    </h4>
                    <span style={{ fontSize: "0.75rem", color: "#6bcf93" }}>Grounded in your approved profile</span>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                    <span className={recommendationStyles[analysis.recommendation] || "border-gray-500 bg-gray-800 text-gray-200"} style={{ padding: "4px 12px", borderRadius: "100px", textTransform: "uppercase", fontSize: "0.75rem", fontWeight: "bold", border: "1px solid" }}>
                      {analysis.recommendation}
                    </span>
                    {overallMatch !== null && <span style={{ fontSize: "0.875rem", color: "#888" }}>Match Score: <strong>{overallMatch}%</strong></span>}
                  </div>

                  <p style={{ fontSize: "0.875rem", color: "#ccc", margin: "0 0 1rem 0" }}>{analysis.explanation}</p>

                  {analysis.matchedSkills && analysis.matchedSkills.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px" }}>
                      <span style={{ fontSize: "0.75rem", color: "#888", textTransform: "uppercase" }}>Matched from your approved evidence</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {analysis.matchedSkills.map((skill) => (
                          <span key={skill.name} style={{ fontSize: "0.75rem", color: "#6bcf93", background: "rgba(107,207,147,0.1)", border: "1px solid rgba(107,207,147,0.25)", padding: "4px 8px", borderRadius: "4px" }}>
                            {skill.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.unusedStrengths && analysis.unusedStrengths.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                      <span style={{ fontSize: "0.75rem", color: "#888", textTransform: "uppercase" }}>Your strengths this role doesn&apos;t ask for</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {analysis.unusedStrengths.map((skill) => (
                          <span key={skill} style={{ fontSize: "0.75rem", color: "#aaa", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", padding: "4px 8px", borderRadius: "4px" }}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: "0.75rem", color: "#888", marginTop: "12px" }}>This is a quick evidence match. Save the role to run a full requirement-by-requirement deep analysis.</p>
                </div>
              )}

              {/* Action Bar */}
              <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {savedJobId ? (
                  <Link href={`/jobs/${savedJobId}`} className="primary-button" style={{ textDecoration: "none" }}>Open saved job <span aria-hidden="true">→</span></Link>
                ) : (
                  <button type="button" onClick={() => void saveJob()} disabled={saving || !title.trim() || isAnalyzing} className="primary-button">
                    {saving ? "Saving…" : "Save to my pipeline"} <span aria-hidden="true">→</span>
                  </button>
                )}
                <span style={{ fontSize: "0.75rem", color: "#888" }}>{title.trim() ? "Save this job to tailor your resume." : "Add a Job Title to save."}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(5px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}} />

      {/* 3. Saved Jobs */}
      {initialJobs.length > 0 && (
        <section className="glass-card" style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "2rem", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 className="section-heading" style={{ margin: "0 0 0.25rem" }}>Saved Opportunities</h2>
              <p style={{ color: "#888", fontSize: "0.875rem", margin: 0 }}>Jobs you have saved to Sartho. Click any job to tailor your resume or track it.</p>
            </div>
            <span className="meta-pill">{initialJobs.length} Saved</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {initialJobs.map((job) => (
              <Link href={`/jobs/${job.id}`} key={job.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.03)", textDecoration: "none", transition: "0.2s" }}>
                <div>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "#aaa", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{job.employer ?? "Employer not recorded"}</span>
                  <strong style={{ display: "block", color: "white", fontSize: "1.125rem", marginBottom: "0.25rem" }}>{job.title}</strong>
                  <small style={{ color: "#666", fontSize: "0.875rem" }}>{job.location ?? "Location not recorded"} · Updated {new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" }).format(new Date(job.updated_at))}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  {job.recommendation ? <span className={recommendationStyles[job.recommendation]} style={{ padding: "4px 12px", borderRadius: "100px", textTransform: "uppercase", fontSize: "0.75rem", fontWeight: "bold", border: "1px solid" }}>{job.recommendation}</span> : null}
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
