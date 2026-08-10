"use client";

import { useMemo, useState } from "react";
import type { ProfileRecord, TargetLaneRecord } from "@/lib/types";

type LaneDraft = Pick<TargetLaneRecord, "id" | "name" | "weight" | "priority" | "active"> & {
  sourceUrl: string;
};

type Suggestion = {
  idealNextMove: string;
  whatMatters: string;
  location: string | null;
  strengths: string[];
  targetProfiles: Array<{ name: string; weight: number }>;
};

export function CareerDirectionEditor({
  initialProfile,
  initialLanes,
  suggestedStrengths,
}: {
  initialProfile: ProfileRecord | null;
  initialLanes: TargetLaneRecord[];
  suggestedStrengths: string[];
}) {
  const [headline, setHeadline] = useState(initialProfile?.headline ?? "");
  const [summary, setSummary] = useState(initialProfile?.summary ?? "");
  const [location, setLocation] = useState(initialProfile?.location ?? "");
  const [workAuthorisation, setWorkAuthorisation] = useState(initialProfile?.work_authorisation ?? "");
  const [strengths, setStrengths] = useState(initialProfile?.strengths ?? suggestedStrengths.slice(0, 8));
  const [lanes, setLanes] = useState<LaneDraft[]>(
    initialLanes.map((lane) => ({
      id: lane.id, name: lane.name, weight: lane.weight, priority: lane.priority,
      active: lane.active, sourceUrl: lane.source_url ?? "",
    })),
  );
  const [strengthDraft, setStrengthDraft] = useState("");
  const [laneDraft, setLaneDraft] = useState("");
  const [laneUrlDraft, setLaneUrlDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const allocation = useMemo(() => lanes.filter((lane) => lane.active).reduce((sum, lane) => sum + lane.weight, 0), [lanes]);

  function addStrength() {
    const value = strengthDraft.trim();
    if (!value || strengths.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setStrengths((items) => [...items, value]);
    setStrengthDraft("");
  }

  /*
   * A role can arrive three ways — typed, suggested, or pasted from a job site.
   * A pasted link keeps its URL for reference; when only a link is given, its
   * last readable path segment becomes a provisional name the person can rename.
   */
  function addLane() {
    const url = laneUrlDraft.trim();
    const name = laneDraft.trim() || nameFromUrl(url);
    if (!name || lanes.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    setLanes((items) => [...items, {
      id: crypto.randomUUID(), name, weight: 0, priority: items.length + 1, active: true,
      sourceUrl: /^https:\/\//i.test(url) ? url : "",
    }]);
    setLaneDraft("");
    setLaneUrlDraft("");
  }

  async function suggest() {
    setSuggesting(true);
    setSuggestError(null);
    setSuggestNote(null);
    try {
      const response = await fetch("/api/career/direction/suggest", { method: "POST" });
      const result = await response.json() as Suggestion & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not suggest a direction.");
      applySuggestion(result);
    } catch (caught) {
      setSuggestError(caught instanceof Error ? caught.message : "Sartho could not suggest a direction.");
    } finally {
      setSuggesting(false);
    }
  }

  /*
   * Suggestions are drafts, not overwrites. Text fields fill only where blank,
   * so nothing the person wrote is lost; strengths merge as a union; and target
   * profiles replace the set only when none exist yet (keeping the suggested
   * weights' 100% balance), otherwise new ones are appended at zero for the
   * person to weight.
   */
  function applySuggestion(s: Suggestion) {
    const filled: string[] = [];
    if (!headline.trim() && s.idealNextMove) { setHeadline(s.idealNextMove); filled.push("ideal next move"); }
    if (!summary.trim() && s.whatMatters) { setSummary(s.whatMatters); filled.push("what matters next"); }
    if (!location.trim() && s.location) { setLocation(s.location); filled.push("location"); }

    setStrengths((current) => {
      const seen = new Set(current.map((item) => item.toLowerCase()));
      const added = s.strengths.filter((item) => !seen.has(item.toLowerCase()));
      return [...current, ...added];
    });

    setLanes((current) => {
      if (!current.length) {
        return s.targetProfiles.map((profile, index) => ({
          id: crypto.randomUUID(), name: profile.name, weight: profile.weight,
          priority: index + 1, active: true, sourceUrl: "",
        }));
      }
      const seen = new Set(current.map((item) => item.name.toLowerCase()));
      const added = s.targetProfiles
        .filter((profile) => !seen.has(profile.name.toLowerCase()))
        .map((profile, index) => ({
          id: crypto.randomUUID(), name: profile.name, weight: 0,
          priority: current.length + index + 1, active: true, sourceUrl: "",
        }));
      return [...current, ...added];
    });

    setSuggestNote(
      filled.length
        ? `Suggestions added — filled ${filled.join(", ")}, plus strengths and target profiles. Review and adjust before saving.`
        : "Strengths and target profiles suggested from your evidence. Your existing context was kept.",
    );
  }

  async function save() {
    setStatus("saving");
    const response = await fetch("/api/career/direction", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        headline, summary, location, workAuthorisation, strengths,
        lanes: lanes.map((lane) => ({
          id: lane.id, name: lane.name, weight: lane.weight, active: lane.active, sourceUrl: lane.sourceUrl,
        })),
      }),
    });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) window.dispatchEvent(new Event("sartho:journey-changed"));
  }

  return (
    <div className="direction-workspace">
      <section className="glass-card direction-panel direction-suggest">
        <div>
          <span className="direction-eyebrow">Start from your evidence</span>
          <h2>Let Sartho propose a direction</h2>
          <p>Sartho reads your approved Career Profile and suggests an ideal next move, what should matter next, your leading strengths and a weighted set of target profiles. Everything it proposes is a draft you can edit, add to or remove.</p>
        </div>
        <button type="button" className="suggest-button" onClick={() => void suggest()} disabled={suggesting}>
          {suggesting ? "Reading your profile…" : "✦ Suggest from my résumé"}
        </button>
        {suggestNote ? <p className="suggest-note" role="status">{suggestNote}</p> : null}
        {suggestError ? <p className="suggest-error" role="alert">{suggestError}</p> : null}
      </section>

      <section className="glass-card direction-panel" id="context">
        <div className="direction-heading"><div><span>Career context</span><h2>What should your next move accomplish?</h2><p>Give Sartho the context a good talent partner would ask for before recommending roles.</p></div></div>
        <div className="direction-fields">
          <label><span>Ideal next move</span><input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="e.g. Senior Engagement Manager in ServiceNow" /></label>
          <label><span>Current location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore" /></label>
          <label><span>Work rights and mobility</span><input value={workAuthorisation} onChange={(event) => setWorkAuthorisation(event.target.value)} placeholder="Countries, visa status, relocation or remote preference" /></label>
          <label className="field-wide"><span>What matters in the next chapter</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} placeholder="Describe the scope, impact, environment and change you want next." /></label>
        </div>
      </section>

      <section className="glass-card direction-panel" id="strengths">
        <div className="direction-heading"><div><span>Career strengths</span><h2>Evidence-backed signals you want to lead with</h2><p>Add, refine or remove strengths. Nothing here is treated as fact until you choose it.</p></div><strong>{strengths.length}</strong></div>
        <div className="editable-chips">
          {strengths.map((strength) => <button key={strength} type="button" onClick={() => setStrengths((items) => items.filter((item) => item !== strength))}>{strength}<span aria-hidden="true">×</span></button>)}
        </div>
        <div className="inline-add"><input value={strengthDraft} onChange={(event) => setStrengthDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addStrength())} placeholder="Add a career strength" /><button type="button" onClick={addStrength}>Add strength</button></div>
      </section>

      <section className="glass-card direction-panel" id="priorities">
        <div className="direction-heading"><div><span>Profile search order</span><h2>Rank the roles Sartho should pursue</h2><p>Weights express priority. They are your search strategy—not hard-coded job titles.</p></div><strong className={allocation === 100 ? "allocation-good" : "allocation-warn"}>{allocation}%</strong></div>
        <div className="lane-editor-list">
          {lanes.map((lane, index) => (
            <article key={lane.id} className={lane.active ? "" : "is-paused"}>
              <span className="lane-rank">{String(index + 1).padStart(2, "0")}</span>
              <div className="lane-name-cell">
                <input aria-label={`Role priority ${index + 1}`} value={lane.name} onChange={(event) => setLanes((items) => items.map((item) => item.id === lane.id ? { ...item, name: event.target.value } : item))} />
                {lane.sourceUrl ? <a href={lane.sourceUrl} target="_blank" rel="noreferrer" className="lane-source">Source ↗</a> : null}
              </div>
              <label><input type="number" min="0" max="100" value={lane.weight} onChange={(event) => setLanes((items) => items.map((item) => item.id === lane.id ? { ...item, weight: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } : item))} /><span>%</span></label>
              <button type="button" onClick={() => setLanes((items) => items.map((item) => item.id === lane.id ? { ...item, active: !item.active } : item))}>{lane.active ? "Active" : "Paused"}</button>
              <button type="button" aria-label={`Remove ${lane.name}`} onClick={() => setLanes((items) => items.filter((item) => item.id !== lane.id))}>×</button>
            </article>
          ))}
        </div>
        <div className="lane-add">
          <input value={laneDraft} onChange={(event) => setLaneDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLane())} placeholder="Add a target role or profile" />
          <input value={laneUrlDraft} onChange={(event) => setLaneUrlDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLane())} placeholder="Paste a job link (LinkedIn or any site) — optional" inputMode="url" />
          <button type="button" onClick={addLane}>Add profile</button>
        </div>
      </section>

      <div className="direction-save-bar"><div><strong>{allocation === 100 ? "Search priorities balanced" : "Save now; activation waits for priorities to total 100%"}</strong><span>{status === "saved" ? "Progress saved securely" : status === "error" ? "Could not save—please try again" : "Changes remain private to your Sartho account"}</span></div><button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : allocation === 100 ? "Save career direction" : "Save progress"}</button></div>
    </div>
  );
}

function nameFromUrl(url: string) {
  if (!/^https:\/\//i.test(url)) return "";
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname;
    return decodeURIComponent(segment).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim().slice(0, 120);
  } catch {
    return "";
  }
}
