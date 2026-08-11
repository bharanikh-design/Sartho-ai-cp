"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetLaneRecord } from "@/lib/types";
import type { SearchSourcePreference } from "@/lib/data/search";

export type SearchSource = SearchSourcePreference;

const recommendedSources: SearchSource[] = [
  { id: "linkedin", name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs/", type: "Professional network", coverage: "Global", trust: "User-verified", active: true },
  { id: "indeed", name: "Indeed", url: "https://www.indeed.com/", type: "Job marketplace", coverage: "Global", trust: "Established source", active: true },
];

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
  const [sources, setSources] = useState<SearchSource[]>(initialSources.length ? initialSources : recommendedSources);
  const [locations, setLocations] = useState(initialLocations);
  const [remote, setRemote] = useState(initialRemote);
  const [locationDraft, setLocationDraft] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const filtered = useMemo(() => sources.filter((source) => source.name.toLowerCase().includes(query.toLowerCase())), [query, sources]);
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

  function addSource() {
    const name = customName.trim(); const url = customUrl.trim();
    if (!name || !/^https:\/\//i.test(url)) return;
    setSources((items) => [...items, { id: crypto.randomUUID(), name, url, type: "Custom source", coverage: "Your choice", trust: "User-added", active: true }]);
    setCustomName(""); setCustomUrl("");
  }

  async function save() {
    // The brief refines search but never blocks the loop: reaching opportunities
    // is the point of this screen, so we fill sensible defaults and always save.
    setStatus("saving");
    const finalLocations = locations.length ? locations : ["Remote"];
    const finalRemote = remote || "Flexible";
    const finalSources = sources.some((source) => source.active) ? sources : recommendedSources;
    const response = await fetch("/api/search-plan", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sources: finalSources, targetLocations: finalLocations, remotePreference: finalRemote }) });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.push("/jobs");
      router.refresh();
    }
  }

  return (
    <div className="search-plan-workspace">
      <section className="search-direction-context" id="profiles">
        <div><span>Career Direction</span><strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles selected"}</strong></div>
        <Link href="/career-direction#priorities">Edit in Career Direction →</Link>
      </section>

      <div className="capability-note">
        <strong>Saved search brief · no automatic discovery yet</strong>
        <span>Sartho stores these choices and uses them as context when you evaluate a role. Selecting a source does not connect to it or fetch jobs from it.</span>
      </div>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Search geography</span><h2>Where should Sartho look?</h2><p>Your current location does not limit your search. Add every country or city where an opportunity is genuinely possible.</p></div></div>
        <div className="editable-chips">{locations.map((location) => <button key={location} type="button" onClick={() => setLocations((items) => items.filter((item) => item !== location))}>{location}<span>×</span></button>)}</div>
        <div className="inline-add"><input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLocation())} placeholder="Singapore, Dubai, Australia, Remote APAC…" /><button type="button" onClick={addLocation}>Add location</button></div>
        <div className="work-model-options" role="group" aria-label="Preferred work model">{["On-site", "Hybrid", "Remote", "Flexible"].map((option) => <button key={option} type="button" className={remote === option ? "is-selected" : ""} onClick={() => setRemote(option)}>{option}</button>)}</div>
      </section>

      <section className="glass-card direction-panel">
        <div className="direction-heading"><div><span>Trusted sources</span><h2>Record the sources you want to use</h2><p>Official employer sites are primary sources; marketplaces can broaden your manual discovery. Automatic source connections are a future capability.</p></div><strong>{activeSourceCount}/{sources.length}</strong></div>
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

      <div className="direction-save-bar"><div><strong>{canSave ? "Search brief ready" : "You can refine this later"}</strong><span>{status === "saved" ? "Saved securely" : status === "error" ? "Could not save—please try again" : incompleteReasons.length ? `Optional: ${incompleteReasons[0]}.` : "This saves evaluation criteria; it does not fetch or submit applications"}</span></div><button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save and open opportunities"}</button></div>
    </div>
  );
}
