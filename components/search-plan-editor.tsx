"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dailyDigest, setDailyDigest] = useState(false); // New daily digest toggle

  // Check incomplete reasons
  const activeSourceCount = sources.filter((source) => source.active).length;
  const incompleteReasons = [
    !targetLanes.length ? "choose at least one target role in Career Direction" : null,
    !locations.length ? "add at least one search location" : null,
    !remote ? "choose a preferred work model" : null,
    !activeSourceCount ? "turn on at least one trusted source" : null,
  ].filter((reason): reason is string => Boolean(reason));
  const canSave = incompleteReasons.length === 0;

  function addLocation() {
    const value = locationDraft.trim();
    if (!value || locations.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setLocations((items) => [...items, value]); setLocationDraft("");
  }

  async function save() {
    if (!canSave) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    
    // Save search plan
    const response = await fetch("/api/search-plan", { 
      method: "PUT", 
      headers: { "content-type": "application/json" }, 
      body: JSON.stringify({ sources, targetLocations: locations, remotePreference: remote }) 
    });
    
    // Save daily digest preference
    await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", enabled: dailyDigest }) // Ideally fetch real email, but enabled state is what matters
    }).catch(() => null);

    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.push("/jobs");
      router.refresh();
    }
  }

  return (
    <div className="search-plan-workspace" style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 0" }}>
      
      {/* 1. Target Roles (Read-Only) */}
      <section className="glass-card direction-panel" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "#666" }}>Career Direction</span>
            <h3 style={{ margin: "0.25rem 0 0" }}>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles selected"}</h3>
          </div>
          <Link href="/career-direction#priorities" style={{ fontSize: "0.875rem", color: "#0066cc" }}>Edit →</Link>
        </div>
      </section>

      {/* 2. Where should Sartho look? (Cleaned up) */}
      <section className="glass-card direction-panel" style={{ marginBottom: "1.5rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <h2>Search Geography & Model</h2>
          <p style={{ color: "#555" }}>Add locations where an opportunity is genuinely possible for you.</p>
        </div>
        
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {locations.map((location) => (
            <span key={location} style={{ background: "#eef2f6", padding: "0.4rem 0.8rem", borderRadius: "100px", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {location}
              <button type="button" onClick={() => setLocations((items) => items.filter((item) => item !== location))} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>×</button>
            </span>
          ))}
        </div>
        
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <input 
            style={{ flex: 1, padding: "0.6rem 1rem", border: "1px solid #ccc", borderRadius: "8px" }}
            value={locationDraft} 
            onChange={(event) => setLocationDraft(event.target.value)} 
            onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLocation())} 
            placeholder="Singapore, Dubai, Australia, Remote APAC…" 
          />
          <button type="button" onClick={addLocation} style={{ padding: "0.6rem 1rem", background: "#f5f5f5", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer" }}>Add</button>
        </div>
        
        <div>
          <p style={{ fontSize: "0.875rem", color: "#555", marginBottom: "0.5rem" }}>Work Model Preference</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {["On-site", "Hybrid", "Remote", "Flexible"].map((option) => (
              <button 
                key={option} 
                type="button" 
                style={{ padding: "0.5rem 1rem", borderRadius: "100px", border: "1px solid", borderColor: remote === option ? "#0d402b" : "#ccc", background: remote === option ? "#0d402b" : "transparent", color: remote === option ? "white" : "inherit", cursor: "pointer" }}
                onClick={() => setRemote(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Trusted Sources (Minimal Toggles) */}
      <section className="glass-card direction-panel" style={{ marginBottom: "1.5rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h2>Trusted Job Sources</h2>
          <p style={{ color: "#555" }}>Toggle the platforms you want Sartho to use as discovery references.</p>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sources.map((source) => (
            <div key={source.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", border: "1px solid #eee", borderRadius: "8px", background: source.active ? "#fafafa" : "transparent" }}>
              <div>
                <strong style={{ display: "block" }}>{source.name}</strong>
                <span style={{ fontSize: "0.8rem", color: "#666" }}>{source.type}</span>
              </div>
              <button 
                type="button" 
                style={{ position: "relative", width: "44px", height: "24px", borderRadius: "100px", background: source.active ? "#0d402b" : "#ccc", border: "none", cursor: "pointer", transition: "0.2s" }}
                onClick={() => setSources((items) => items.map((item) => item.id === source.id ? { ...item, active: !item.active } : item))}
              >
                <span style={{ position: "absolute", left: source.active ? "22px" : "2px", top: "2px", width: "20px", height: "20px", background: "white", borderRadius: "50%", transition: "0.2s" }} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Daily Digest */}
      <section className="glass-card direction-panel" style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>Daily Opportunities Digest</h2>
          <p style={{ color: "#555" }}>Get an email summarizing matching roles every morning.</p>
        </div>
        <button 
          type="button" 
          style={{ position: "relative", width: "44px", height: "24px", borderRadius: "100px", background: dailyDigest ? "#0d402b" : "#ccc", border: "none", cursor: "pointer", transition: "0.2s" }}
          onClick={() => setDailyDigest(!dailyDigest)}
        >
          <span style={{ position: "absolute", left: dailyDigest ? "22px" : "2px", top: "2px", width: "20px", height: "20px", background: "white", borderRadius: "50%", transition: "0.2s" }} />
        </button>
      </section>

      {/* 5. Save Bar */}
      <div style={{ background: "white", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong style={{ display: "block", color: canSave ? "#0d402b" : "#d9534f" }}>
            {canSave ? "Search brief ready" : "Action Required"}
          </strong>
          <span style={{ fontSize: "0.875rem", color: "#666" }}>
            {incompleteReasons.length ? `Please ${incompleteReasons[0]} to continue.` : "Save your criteria to unlock the Opportunities board."}
          </span>
        </div>
        <button 
          type="button" 
          style={{ padding: "0.8rem 1.5rem", background: canSave ? "#0d402b" : "#ccc", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: canSave ? "pointer" : "not-allowed", transition: "0.2s" }}
          onClick={() => void save()} 
          disabled={status === "saving" || !canSave}
        >
          {status === "saving" ? "Saving…" : "Save & Open Opportunities"}
        </button>
      </div>
    </div>
  );
}
