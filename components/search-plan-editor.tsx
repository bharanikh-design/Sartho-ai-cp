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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const activeSourceCount = sources.filter((source) => source.active).length;

  const hasChanges = useMemo(() => {
    if (remote !== initialRemote) return true;
    if (locations.length !== initialLocations.length) return true;
    if (locations.some((loc) => !initialLocations.includes(loc))) return true;
    const initialSourcesList = initialSources.length ? initialSources : DEFAULT_JOB_SOURCES;
    if (sources.length !== initialSourcesList.length) return true;
    for (let i = 0; i < sources.length; i++) {
      if (sources[i].active !== initialSourcesList[i].active) return true;
    }
    return false;
  }, [remote, locations, sources, initialRemote, initialLocations, initialSources]);

  function addLocation() {
    const value = locationDraft.trim();
    if (!value || locations.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setLocations((items) => [...items, value]);
    setLocationDraft("");
  }

  async function save() {
    // The brief refines search but never blocks the loop: reaching the dashboard
    // is the point of this screen, so we fill sensible defaults and always save.
    if (!hasChanges) {
      router.push("/");
      return;
    }
    setStatus("saving");
    const finalLocations = locations.length ? locations : ["Remote"];
    const finalRemote = remote || "Flexible";
    const finalSources = sources.some((source) => source.active) ? sources : DEFAULT_JOB_SOURCES;
    const response = await fetch("/api/search-plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sources: finalSources, targetLocations: finalLocations, remotePreference: finalRemote }),
    });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.push("/");
    }
  }

  return (
    <div className="search-plan-workspace">
      <section className="search-direction-context" id="profiles">
        <div><span>Targeting</span><strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles selected"}</strong></div>
        <Link href="/career-direction#priorities">Edit in Career Direction →</Link>
      </section>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Search geography</span><h2>Where should Sartho look?</h2></div></div>
        <div className="editable-chips">{locations.map((location) => <button key={location} type="button" onClick={() => setLocations((items) => items.filter((item) => item !== location))}>{location}<span>×</span></button>)}</div>
        <div className="inline-add"><input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLocation())} placeholder="Singapore, Dubai, Remote APAC…" /><button type="button" onClick={addLocation}>Add</button></div>
        <div className="work-model-options" role="group" aria-label="Preferred work model">{["On-site", "Hybrid", "Remote", "Flexible"].map((option) => <button key={option} type="button" className={remote === option ? "is-selected" : ""} onClick={() => setRemote(option)}>{option}</button>)}</div>
      </section>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Trusted sources</span><h2>Where you look for roles</h2></div><strong>{activeSourceCount}/{sources.length}</strong></div>
        <div className="production-source-list">
          {sources.map((source) => (
            <article key={source.id} className={source.active ? "" : "is-paused"}>
              <span className="source-monogram">{source.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
              <div><strong>{source.name}</strong><span>{source.type}</span></div>
              <div><strong>{source.coverage}</strong><span>Coverage</span></div>
              <button type="button" className={source.active ? "source-toggle is-on" : "source-toggle"} aria-pressed={source.active} onClick={() => setSources((items) => items.map((item) => item.id === source.id ? { ...item, active: !item.active } : item))}><span /></button>
            </article>
          ))}
        </div>
      </section>

      <div className="direction-save-bar">
        {status === "error" ? <span className="direction-save-status is-error" role="alert">Could not save — please try again</span> : status === "saved" ? <span className="direction-save-status">Saved ✓</span> : null}
        <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : hasChanges ? "Save and continue" : "Go to Dashboard"}</button>
      </div>
    </div>
  );
}
