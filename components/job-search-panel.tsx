"use client";

import { useState } from "react";
import Link from "next/link";

/*
 * Real search, on demand. Presses the brief against the jobs provider and shows
 * what comes back, each role scored against approved evidence. Saving a role
 * routes through the same /api/jobs the manual analyser uses, so a searched role
 * and a pasted one are identical once in the pipeline. When no provider is
 * configured this says so plainly — it never shows a placeholder result.
 */

type SearchResult = {
  title: string;
  employer: string | null;
  location: string | null;
  url: string;
  salary: string | null;
  postedAt: string | null;
  source: string;
  description: string;
  overallMatch: number;
  recommendation: "apply" | "review" | "skip";
  matchedSkills: string[];
};

const recTone: Record<SearchResult["recommendation"], string> = {
  apply: "#6bcf93",
  review: "#e0b061",
  skip: "#e5917a",
};

export function JobSearchPanel() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "not_configured" | "no_targets">("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [savedUrls, setSavedUrls] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function runSearch() {
    setStatus("loading");
    setError(null);
    setSaveError(null);
    try {
      const response = await fetch("/api/jobs/search", { method: "POST" });
      const data = await response.json() as { results?: SearchResult[]; error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "not_configured") { setStatus("not_configured"); return; }
        if (data.code === "no_targets") { setStatus("no_targets"); setError(data.error ?? null); return; }
        throw new Error(data.error ?? "Search failed.");
      }
      setResults(data.results ?? []);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
      setStatus("error");
    }
  }

  async function save(result: SearchResult) {
    if (savingUrl) return;
    setSavingUrl(result.url);
    setSaveError(null);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          employer: result.employer ?? "",
          location: result.location ?? "",
          sourceUrl: result.url,
          description: result.description,
        }),
      });
      const data = await response.json() as { job?: unknown; error?: string };
      if (!response.ok || !data.job) throw new Error(data.error ?? "Could not save this role.");
      setSavedUrls((urls) => [...urls, result.url]);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save this role.");
    } finally {
      setSavingUrl(null);
    }
  }

  return (
    <section className="glass-card content-card" id="find-roles">
      <div className="card-header">
        <div>
          <h2 className="section-heading">Find matching roles</h2>
          <p className="section-subtitle">Sartho searches live listings for your target roles and scores each one against your approved evidence.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => void runSearch()} disabled={status === "loading"}>
          {status === "loading" ? "Searching…" : "Search now"}
        </button>
      </div>

      {status === "not_configured" ? (
        <div className="empty-inline-state">
          Live search isn&apos;t connected yet. Add a jobs provider key — <code>JSEARCH_RAPIDAPI_KEY</code> (Google for Jobs) or <code>ADZUNA_APP_ID</code> + <code>ADZUNA_APP_KEY</code> — in the deployment settings, then search here. Until then, add roles by hand on <Link href="/applications#add-role">Applications</Link>.
        </div>
      ) : null}

      {status === "no_targets" ? (
        <div className="empty-inline-state">
          {error ?? "Choose your target roles first."} <Link href="/career-direction#priorities">Set them in Career Direction →</Link>
        </div>
      ) : null}

      {status === "error" ? <div className="inline-error" role="alert">{error}</div> : null}

      {status === "ready" && !results.length ? (
        <div className="empty-inline-state">No live matches for your brief right now. Try broadening your locations or target roles.</div>
      ) : null}

      {saveError ? <div className="inline-error" role="alert">{saveError}</div> : null}

      {results.length ? (
        <div className="application-list" style={{ marginTop: "8px" }}>
          {results.map((result) => {
            const saved = savedUrls.includes(result.url);
            return (
              <article className="application-row" key={result.url} style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {result.employer ?? "Employer not listed"}{result.location ? ` · ${result.location}` : ""}
                  </span>
                  <strong style={{ display: "block", fontSize: "1.0625rem", margin: "2px 0" }}>{result.title}</strong>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", margin: "6px 0" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: recTone[result.recommendation], border: `1px solid ${recTone[result.recommendation]}55`, background: `${recTone[result.recommendation]}18`, padding: "3px 10px", borderRadius: "100px" }}>{result.recommendation}</span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{result.overallMatch}% match</span>
                    {result.salary ? <span style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>{result.salary}</span> : null}
                    <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{result.source}</span>
                  </div>
                  {result.matchedSkills.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {result.matchedSkills.map((skill) => (
                        <span key={skill} style={{ fontSize: "0.7rem", color: "#6bcf93", background: "rgba(107,207,147,0.1)", border: "1px solid rgba(107,207,147,0.25)", padding: "3px 8px", borderRadius: "4px" }}>{skill}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "none" }}>
                  {saved ? (
                    <Link href="/applications" className="secondary-button" style={{ whiteSpace: "nowrap" }}>Saved ✓</Link>
                  ) : (
                    <button type="button" className="primary-button" onClick={() => void save(result)} disabled={savingUrl === result.url} style={{ whiteSpace: "nowrap" }}>
                      {savingUrl === result.url ? "Saving…" : "Save to pipeline"}
                    </button>
                  )}
                  <a href={result.url} target="_blank" rel="noreferrer" className="secondary-button" style={{ whiteSpace: "nowrap", textAlign: "center" }}>View ↗</a>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
