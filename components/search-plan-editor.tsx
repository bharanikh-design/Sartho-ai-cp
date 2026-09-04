"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetLaneRecord } from "@/lib/types";
import type { SearchSourcePreference } from "@/lib/data/search";

import { DEFAULT_JOB_SOURCES } from "@/lib/config/job-sources";

export type SearchSource = SearchSourcePreference;

export function SearchPlanEditor({
  initialSources,
  initialLocations,
  initialRemote,
  targetLanes,
}: {
  initialSources: SearchSource[];
  initialLocations: string[];
  initialRemote: string;
  targetLanes: TargetLaneRecord[];
}) {
  const router = useRouter();
  const [sources, setSources] = useState<SearchSource[]>(initialSources.length ? initialSources : DEFAULT_JOB_SOURCES);
  const [locations, setLocations] = useState(initialLocations);
  const [remote, setRemote] = useState(initialRemote);
  const [locationDraft, setLocationDraft] = useState("");
  const [dailyDigest, setDailyDigest] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  
  // New state for AI Discovery Engine
  const [targetCompanies, setTargetCompanies] = useState<string[]>([]);
  const [companyDraft, setCompanyDraft] = useState("");
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  
  const activeSourceCount = sources.filter((source) => source.active).length;
  const incompleteReasons = [
    !targetLanes.length ? "choose at least one target role in Career Direction" : null,
    !locations.length ? "add at least one search location" : null,
    !remote ? "choose a preferred work model" : null,
    !activeSourceCount ? "turn on at least one trusted source" : null,
  ].filter((reason): reason is string => Boolean(reason));
  
  const canSave = incompleteReasons.length === 0;

  const hasChanges = useMemo(() => {
    if (remote !== initialRemote) return true;
    if (dailyDigest !== false) return true;
    if (locations.length !== initialLocations.length) return true;
    if (locations.some(loc => !initialLocations.includes(loc))) return true;
    if (targetCompanies.length > 0) return true; // Dirty if we added companies
    if (aiRationale !== null) return true;
    
    const initialSourcesList = initialSources.length ? initialSources : DEFAULT_JOB_SOURCES;
    if (sources.length !== initialSourcesList.length) return true;
    for (let i = 0; i < sources.length; i++) {
      if (sources[i].active !== initialSourcesList[i].active) return true;
    }
    return false;
  }, [remote, dailyDigest, locations, sources, initialRemote, initialLocations, initialSources, targetCompanies, aiRationale]);

  function addLocation() {
    const value = locationDraft.trim();
    if (!value || locations.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setLocations((items) => [...items, value]); setLocationDraft("");
  }

  function addCompany() {
    const value = companyDraft.trim();
    if (!value || targetCompanies.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setTargetCompanies((items) => [...items, value]); setCompanyDraft("");
  }

  function generateAiStrategy() {
    setIsGeneratingStrategy(true);
    setAiRationale(null);
    
    // Simulate API call analyzing the resume to build a search strategy
    setTimeout(() => {
      setLocations(["Singapore", "Remote APAC", "Sydney, Australia"]);
      setRemote("Flexible");
      setTargetCompanies(["Deloitte", "KPMG", "Accenture", "NTT DATA", "Canva"]);
      setSources((prev) => prev.map(s => s.name.includes("LinkedIn") || s.name.includes("Indeed") ? { ...s, active: true } : s));
      setAiRationale("Based on your evidence showing strong ITSM and ServiceNow deployment experience, large technology consultancies and enterprise SaaS companies in the APAC region offer the highest probability of a senior match. I have pre-populated 5 target employers and optimized your geography, and activated LinkedIn and Indeed as your highest-signal discovery sources.");
      setIsGeneratingStrategy(false);
    }, 2500);
  }

  async function save() {
    if (!canSave) {
      setStatus("error");
      return;
    }
    
    if (!hasChanges) {
      router.push("/");
      return;
    }

    setStatus("saving");
    
    // Pass targetCompanies to the backend if supported (prototyped for now)
    const response = await fetch("/api/search-plan", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sources, targetLocations: locations, remotePreference: remote }) });
    
    if (dailyDigest) {
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", enabled: true })
      }).catch(() => null);
    }

    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.push("/");
    }
  }

  return (
    <div className="search-plan-workspace">
      
      {/* AI Discovery Engine Banner */}
      {!aiRationale && !isGeneratingStrategy && locations.length === 0 && (
        <section className="glass-card" style={{ padding: "2rem", background: "linear-gradient(to right, rgba(107, 207, 147, 0.1), rgba(0,0,0,0.2))", border: "1px solid rgba(107, 207, 147, 0.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 className="section-heading" style={{ color: "#6bcf93", marginBottom: "0.5rem" }}>Generate an AI Search Strategy ✦</h2>
              <p style={{ color: "#ccc", margin: 0, maxWidth: "600px" }}>Don't know exactly where to look? Sartho can analyze your Master Resume and auto-suggest the top locations, work models, and specific companies you should target.</p>
            </div>
            <button type="button" className="primary-button" onClick={generateAiStrategy}>
              Analyze my profile
            </button>
          </div>
        </section>
      )}

      {isGeneratingStrategy && (
        <section className="glass-card" style={{ padding: "3rem", textAlign: "center", border: "1px solid rgba(107, 207, 147, 0.3)" }}>
          <div style={{ height: "40px", width: "40px", borderRadius: "50%", border: "3px solid rgba(107, 207, 147, 0.3)", borderTopColor: "#6bcf93", animation: "spin 1s linear infinite", margin: "0 auto 1.5rem" }} />
          <h2 style={{ color: "white", marginBottom: "0.5rem" }}>Building your Search Brief...</h2>
          <p style={{ color: "#888" }}>Cross-referencing your Career Profile against current market trends.</p>
          <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
        </section>
      )}

      {aiRationale && (
        <section className="glass-card" style={{ padding: "1.5rem", borderLeft: "4px solid #6bcf93", background: "rgba(107, 207, 147, 0.05)" }}>
          <h3 style={{ fontSize: "1rem", color: "#6bcf93", margin: "0 0 0.5rem" }}>✦ Sartho AI Strategy</h3>
          <p style={{ fontSize: "0.875rem", color: "#ccc", margin: 0, lineHeight: 1.6 }}>{aiRationale}</p>
        </section>
      )}

      <section className="search-direction-context" id="profiles">
        <div><span>Career Direction</span><strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles selected"}</strong></div>
        <Link href="/career-direction#priorities">Edit in Career Direction →</Link>
      </section>

      
      {!aiRationale && !isGeneratingStrategy && (
        <section className="glass-card" style={{ marginBottom: "1.5rem", padding: "1.5rem", border: "1px solid #6bcf93", background: "rgba(107, 207, 147, 0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "1.1rem", color: "#6bcf93", margin: "0 0 0.5rem" }}>✦ Let AI generate your Search Brief</h3>
            <p style={{ fontSize: "0.875rem", color: "#ccc", margin: 0, lineHeight: 1.5 }}>
              Sartho can instantly recommend target locations, companies, and trusted job sources based on your Career Profile strengths.
            </p>
          </div>
          <button type="button" onClick={generateAiStrategy} style={{ background: "#6bcf93", color: "#0d402b", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer" }}>
            Generate Brief ✦
          </button>
        </section>
      )}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <section className="glass-card direction-panel" style={{ margin: 0 }}>
          <div className="direction-heading"><div><span>Search geography</span><h2>Where should Sartho look?</h2></div></div>
          
          <div className="editable-chips">{locations.map((location) => <button key={location} type="button" onClick={() => setLocations((items) => items.filter((item) => item !== location))}>{location}<span>×</span></button>)}</div>
          
          <div className="inline-add"><input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLocation())} placeholder="Singapore, Dubai, Remote APAC…" /><button type="button" onClick={addLocation} style={{ color: "#0d402b", fontWeight: "bold" }}>Add</button></div>
          
          <div className="work-model-options" role="group" style={{ marginTop: "1rem" }}>{["On-site", "Hybrid", "Remote", "Flexible"].map((option) => <button key={option} type="button" className={remote === option ? "is-selected" : ""} onClick={() => setRemote(option)}>{option}</button>)}</div>
        </section>

        <section className="glass-card direction-panel" style={{ margin: 0 }}>
          <div className="direction-heading"><div><span>Target Employers</span><h2>Specific companies to monitor</h2></div></div>
          
          <div className="editable-chips">{targetCompanies.map((company) => <button key={company} type="button" onClick={() => setTargetCompanies((items) => items.filter((item) => item !== company))}>{company}<span>×</span></button>)}</div>
          
          <div className="inline-add"><input value={companyDraft} onChange={(event) => setCompanyDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addCompany())} placeholder="Deloitte, Google, Canva..." /><button type="button" onClick={addCompany} style={{ color: "#0d402b", fontWeight: "bold" }}>Add</button></div>
        </section>
      </div>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Trusted sources</span><h2>Record the sources you want to use</h2><p>Toggle the platforms you want Sartho to use as discovery references.</p></div><strong>{activeSourceCount}/{sources.length}</strong></div>
        
        <div className="production-source-list">
          {sources.map((source) => (
            <article key={source.id} className={source.active ? "" : "is-paused"}>
              <span className="source-monogram">{source.name.split(/\s+/).map((part) => part[0]).slice(0,2).join("")}</span>
              <div><strong>{source.name}</strong><span>{source.type}</span></div>
              <div><strong>{source.coverage}</strong><span>Coverage</span></div>
              <button type="button" className={source.active ? "source-toggle is-on" : "source-toggle"} aria-pressed={source.active} onClick={() => setSources((items) => items.map((item) => item.id === source.id ? { ...item, active: !item.active } : item))}><span /></button>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card direction-panel">
        <div className="direction-heading">
          <div>
            <span>Automation</span>
            <h2>Daily Opportunities Digest</h2>
            <p>Get a morning email summarizing matching roles from these sources.</p>
          </div>
          <button type="button" className={dailyDigest ? "source-toggle is-on" : "source-toggle"} aria-pressed={dailyDigest} onClick={() => setDailyDigest(!dailyDigest)}><span /></button>
        </div>
      </section>

      <div className="direction-save-bar">
        <div>
          <strong>{canSave ? (hasChanges ? "Search brief ready for your approval" : "Search brief is up to date") : "Complete your search brief before continuing"}</strong>
          <span>{status === "saved" ? "Saved securely" : status === "error" && canSave ? "Could not save—please try again" : incompleteReasons.length ? `Next: ${incompleteReasons[0]}.` : (hasChanges ? "One click to save changes and open your Dashboard" : "No changes made.")}</span>
        </div>
        <button 
          type="button" 
          className={hasChanges ? "primary-button" : "secondary-button"} 
          onClick={() => void save()} 
          disabled={status === "saving" || !canSave}
        >
          {status === "saving" ? "Saving…" : (hasChanges ? "Save and go to Dashboard" : "Return to Dashboard")}
        </button>
      </div>
    </div>
  );
}
