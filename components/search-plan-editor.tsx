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
    const response = await fetch("/api/search-plan", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sources, targetLocations: locations, remotePreference: remote }) });
    
    // Save digest preference if toggled
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
      <section className="search-direction-context" id="profiles">
        <div><span>Career Direction</span><strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles selected"}</strong></div>
        <Link href="/career-direction#priorities">Edit in Career Direction →</Link>
      </section>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Search geography</span><h2>Where should Sartho look?</h2><p>Your current location does not limit your search. Add every country or city where an opportunity is genuinely possible.</p></div></div>
        
        <div className="editable-chips">{locations.map((location) => <button key={location} type="button" onClick={() => setLocations((items) => items.filter((item) => item !== location))}>{location}<span>×</span></button>)}</div>
        
        <div className="inline-add"><input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLocation())} placeholder="Singapore, Dubai, Australia, Remote APAC…" /><button type="button" onClick={addLocation}>Add location</button></div>
        
        <div className="work-model-options" role="group" aria-label="Preferred work model">{["On-site", "Hybrid", "Remote", "Flexible"].map((option) => <button key={option} type="button" className={remote === option ? "is-selected" : ""} onClick={() => setRemote(option)}>{option}</button>)}</div>
      </section>

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
          <strong>{canSave ? "Search brief ready for your approval" : "Complete your search brief before continuing"}</strong>
          <span>{status === "saved" ? "Saved securely" : status === "error" && canSave ? "Could not save—please try again" : incompleteReasons.length ? `Next: ${incompleteReasons[0]}.` : "One click to finish setup and open your Dashboard"}</span>
        </div>
        <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving" || !canSave}>
          {status === "saving" ? "Saving…" : "Save and go to Dashboard"}
        </button>
      </div>
    </div>
  );
}
