"use client";

import { useMemo, useState } from "react";

export type SearchSource = { id: string; name: string; url: string; type: string; coverage: string; trust: string; active: boolean };

const recommendedSources: SearchSource[] = [
  { id: "linkedin", name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs/", type: "Professional network", coverage: "Global", trust: "User-verified", active: true },
  { id: "indeed", name: "Indeed", url: "https://www.indeed.com/", type: "Job marketplace", coverage: "Global", trust: "Established source", active: true },
  { id: "servicenow", name: "ServiceNow Careers", url: "https://careers.servicenow.com/", type: "Official employer site", coverage: "Global", trust: "Primary source", active: true },
  { id: "deloitte", name: "Deloitte Careers", url: "https://www.deloitte.com/global/en/careers.html", type: "Official employer site", coverage: "Global", trust: "Primary source", active: true },
];

export function SearchPlanEditor({ initialSources, initialLocations, initialRemote }: { initialSources: SearchSource[]; initialLocations: string[]; initialRemote: string }) {
  const [sources, setSources] = useState<SearchSource[]>(initialSources.length ? initialSources : recommendedSources);
  const [locations, setLocations] = useState(initialLocations);
  const [remote, setRemote] = useState(initialRemote);
  const [locationDraft, setLocationDraft] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const filtered = useMemo(() => sources.filter((source) => source.name.toLowerCase().includes(query.toLowerCase())), [query, sources]);

  function addLocation() {
    const value = locationDraft.trim();
    if (!value || locations.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setLocations((items) => [...items, value]); setLocationDraft("");
  }

  function addSource() {
    const name = customName.trim(); const url = customUrl.trim();
    if (!name || !/^https:\/\//i.test(url)) return;
    setSources((items) => [...items, { id: crypto.randomUUID(), name, url, type: "Custom source", coverage: "Your choice", trust: "User-added", active: true }]);
    setCustomName(""); setCustomUrl("");
  }

  async function save() {
    setStatus("saving");
    const response = await fetch("/api/search-plan", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sources, targetLocations: locations, remotePreference: remote }) });
    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <div className="search-plan-workspace">
      <section className="glass-card search-plan-summary">
        <div><span>Target locations</span><strong>{locations.length || "Not set"}</strong></div>
        <div><span>Active sources</span><strong>{sources.filter((source) => source.active).length}</strong></div>
        <div><span>Work model</span><strong>{remote || "Flexible"}</strong></div>
        <div><span>Control</span><strong>You approve every application</strong></div>
      </section>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Search geography</span><h2>Where should Sartho look?</h2><p>Your current location does not limit your search. Add every country or city where an opportunity is genuinely possible.</p></div></div>
        <div className="editable-chips">{locations.map((location) => <button key={location} type="button" onClick={() => setLocations((items) => items.filter((item) => item !== location))}>{location}<span>×</span></button>)}</div>
        <div className="inline-add"><input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLocation())} placeholder="Singapore, Dubai, Australia, Remote APAC…" /><button type="button" onClick={addLocation}>Add location</button></div>
        <div className="work-model-options" role="group" aria-label="Preferred work model">{["On-site", "Hybrid", "Remote", "Flexible"].map((option) => <button key={option} type="button" className={remote === option ? "is-selected" : ""} onClick={() => setRemote(option)}>{option}</button>)}</div>
      </section>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Trusted sources</span><h2>Choose where opportunities come from</h2><p>Official employer sites are primary sources. Marketplaces broaden discovery. Sartho will never submit an application without your approval.</p></div><strong>{sources.filter((source) => source.active).length}/{sources.length}</strong></div>
        <div className="source-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a source" /></div>
        <div className="production-source-list">
          {filtered.map((source) => (
            <article key={source.id} className={source.active ? "" : "is-paused"}>
              <span className="source-monogram">{source.name.split(/\s+/).map((part) => part[0]).slice(0,2).join("")}</span>
              <div><strong>{source.name}</strong><span>{source.type}</span></div>
              <div><strong>{source.coverage}</strong><span>Coverage</span></div>
              <div><strong>{source.trust}</strong><span>Trust</span></div>
              <a href={source.url} target="_blank" rel="noreferrer">Open source</a>
              <button type="button" className={source.active ? "source-toggle is-on" : "source-toggle"} aria-pressed={source.active} onClick={() => setSources((items) => items.map((item) => item.id === source.id ? { ...item, active: !item.active } : item))}><span /></button>
            </article>
          ))}
        </div>
        <div className="custom-source-add"><input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Employer or job source" /><input value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} placeholder="https://…" /><button type="button" onClick={addSource}>Add custom source</button></div>
      </section>

      <div className="direction-save-bar"><div><strong>Search plan ready for your approval</strong><span>{status === "saved" ? "Saved securely" : status === "error" ? "Could not save—please try again" : "This controls discovery only, never automatic applications"}</span></div><button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save search plan"}</button></div>
    </div>
  );
}
