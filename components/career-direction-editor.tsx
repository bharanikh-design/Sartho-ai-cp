"use client";

import { useMemo, useState } from "react";
import type { GroundedDirectionSuggestion } from "@/lib/career/direction-suggestions";
import type { ProfileRecord, TargetLaneRecord } from "@/lib/types";

type LaneDraft = Pick<TargetLaneRecord, "id" | "name" | "weight" | "priority" | "active">;

function balanceByPriority(items: LaneDraft[]) {
  if (!items.length) return [];
  const totalScore = items.reduce((sum, _item, index) => sum + items.length - index, 0);
  const weighted = items.map((item, index) => ({
    ...item,
    active: true,
    priority: index + 1,
    weight: Math.floor(((items.length - index) / totalScore) * 100),
  }));
  let remainder = 100 - weighted.reduce((sum, item) => sum + item.weight, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % weighted.length) {
    weighted[index].weight += 1;
    remainder -= 1;
  }
  return weighted;
}

export function CareerDirectionEditor({
  initialProfile,
  initialLanes,
  suggestedStrengths,
  evidenceCount,
  roleCount,
}: {
  initialProfile: ProfileRecord | null;
  initialLanes: TargetLaneRecord[];
  suggestedStrengths: string[];
  evidenceCount: number;
  roleCount: number;
}) {
  const [headline, setHeadline] = useState(initialProfile?.headline ?? "");
  const [summary, setSummary] = useState(initialProfile?.summary ?? "");
  const [location, setLocation] = useState(initialProfile?.location ?? "");
  const [workAuthorisation, setWorkAuthorisation] = useState(initialProfile?.work_authorisation ?? "");
  const [lanes, setLanes] = useState<LaneDraft[]>(() => balanceByPriority(initialLanes));
  const [laneDraft, setLaneDraft] = useState("");
  const [suggestions, setSuggestions] = useState<GroundedDirectionSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const allocation = useMemo(() => lanes.reduce((sum, lane) => sum + lane.weight, 0), [lanes]);
  const visibleSuggestions = suggestions.filter((item) => !dismissed.includes(item.name));

  function addLaneName(value: string) {
    const name = value.trim();
    if (!name || lanes.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    setLanes((items) => balanceByPriority([...items, {
      id: crypto.randomUUID(), name, weight: 0, priority: items.length + 1, active: true,
    }]));
  }

  function addManualLane() {
    addLaneName(laneDraft);
    setLaneDraft("");
  }

  function moveLane(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= lanes.length) return;
    setLanes((items) => {
      const reordered = [...items];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return balanceByPriority(reordered);
    });
  }

  async function generateSuggestions() {
    if (aiStatus === "loading") return;
    setAiStatus("loading");
    setAiError(null);
    setDismissed([]);
    try {
      const response = await fetch("/api/career/direction/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          headline,
          summary,
          location,
          workAuthorisation,
          existingLanes: lanes.map((lane) => lane.name),
        }),
      });
      const result = await response.json() as { suggestions?: GroundedDirectionSuggestion[]; error?: string };
      if (!response.ok || !result.suggestions) throw new Error(result.error ?? "AI could not create suggestions.");
      setSuggestions(result.suggestions);
      setAiStatus("ready");
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : "AI could not create suggestions.");
      setAiStatus("error");
    }
  }

  async function save() {
    setStatus("saving");
    const strengths = initialProfile?.strengths?.length ? initialProfile.strengths : suggestedStrengths.slice(0, 12);
    const response = await fetch("/api/career/direction", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headline, summary, location, workAuthorisation, strengths, lanes }),
    });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) window.dispatchEvent(new Event("sartho:journey-changed"));
  }

  return (
    <div className="direction-workspace direction-ai-workspace">
      <section className="direction-ai-advisor" id="strengths">
        <div className="direction-ai-intro">
          <div>
            <span className="ai-orbit" aria-hidden="true">✦</span>
            <span className="direction-ai-label">Sartho AI career strategist</span>
          </div>
          <h2>Let your résumé suggest where you can go next.</h2>
          <p>AI reads only the career facts you approved, proposes direct, adjacent and stretch paths, and shows the evidence behind each one. Nothing joins your priorities until you choose it.</p>
          <div className="direction-ai-grounding">
            <span><strong>{evidenceCount}</strong> approved career facts</span>
            <span><strong>{roleCount}</strong> roles understood</span>
            <span><strong>You decide</strong> what gets added</span>
          </div>
          <div className="direction-ai-prompt">
            <label htmlFor="direction-goal">Anything you want AI to optimise for? <span>Optional</span></label>
            <textarea id="direction-goal" value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} placeholder="For example: regional leadership, less travel, more transformation ownership…" />
            <button type="button" onClick={() => void generateSuggestions()} disabled={aiStatus === "loading" || evidenceCount === 0}>
              <span aria-hidden="true">✦</span>
              {aiStatus === "loading" ? "Analysing your Career Profile…" : aiStatus === "ready" ? "Refresh AI suggestions" : "Generate AI suggestions"}
            </button>
          </div>
          {evidenceCount === 0 ? <div className="direction-ai-message">Confirm your Career Profile first so every suggestion has evidence behind it.</div> : null}
          {aiError ? <div className="direction-ai-message is-error" role="alert">{aiError}</div> : null}
        </div>

        {aiStatus === "loading" ? (
          <div className="direction-suggestion-grid" aria-label="Generating career suggestions">
            {[1, 2, 3].map((item) => <div key={item} className="direction-suggestion-skeleton" />)}
          </div>
        ) : visibleSuggestions.length ? (
          <div className="direction-suggestion-grid" aria-live="polite">
            {visibleSuggestions.map((suggestion) => {
              const added = lanes.some((lane) => lane.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase());
              return (
                <article key={suggestion.name} className={`direction-suggestion-card is-${suggestion.path}`}>
                  <div className="suggestion-card-top">
                    <span>{suggestion.path === "direct" ? "Direct next step" : suggestion.path === "adjacent" ? "Adjacent possibility" : "Stretch possibility"}</span>
                    <button type="button" aria-label={`Dismiss ${suggestion.name}`} onClick={() => setDismissed((items) => [...items, suggestion.name])}>×</button>
                  </div>
                  <h3>{suggestion.name}</h3>
                  <p>{suggestion.rationale}</p>
                  <details>
                    <summary>Why AI suggested this</summary>
                    <ul>{suggestion.supportingSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
                  </details>
                  <button type="button" className={added ? "is-added" : ""} onClick={() => addLaneName(suggestion.name)} disabled={added}>
                    {added ? "Added to priorities ✓" : "Add to my priorities →"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="glass-card direction-priority-panel" id="priorities">
        <div className="direction-priority-heading">
          <div><span>Your decision</span><h2>Roles Sartho should prioritise</h2><p>Order them from most to least important. Sartho balances the search weighting automatically.</p></div>
          <strong>{lanes.length}</strong>
        </div>

        {lanes.length ? (
          <div className="direction-priority-list">
            {lanes.map((lane, index) => (
              <article key={lane.id}>
                <span className="priority-rank">{index + 1}</span>
                <div><input aria-label={`Priority ${index + 1}`} value={lane.name} onChange={(event) => setLanes((items) => items.map((item) => item.id === lane.id ? { ...item, name: event.target.value } : item))} /><small>{index === 0 ? "Highest priority" : `${lane.weight}% search emphasis`}</small></div>
                <div className="priority-order-actions">
                  <button type="button" disabled={index === 0} onClick={() => moveLane(index, -1)} aria-label={`Move ${lane.name} up`}>↑</button>
                  <button type="button" disabled={index === lanes.length - 1} onClick={() => moveLane(index, 1)} aria-label={`Move ${lane.name} down`}>↓</button>
                  <button type="button" onClick={() => setLanes((items) => balanceByPriority(items.filter((item) => item.id !== lane.id)))} aria-label={`Remove ${lane.name}`}>×</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="direction-priority-empty"><strong>No priorities selected yet</strong><span>Choose an AI suggestion above or add the first role yourself.</span></div>
        )}

        <div className="direction-manual-add">
          <input value={laneDraft} onChange={(event) => setLaneDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addManualLane())} placeholder="Or add a role manually" />
          <button type="button" onClick={addManualLane}>Add role</button>
        </div>
      </section>

      <details className="glass-card direction-preferences" id="context">
        <summary><span><strong>Refine the guidance</strong><small>Optional location, mobility and target-role context</small></span><span>Open</span></summary>
        <div className="direction-fields">
          <label><span>Role or level already in mind</span><input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="e.g. Regional Transformation Director" /></label>
          <label><span>Current location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore" /></label>
          <label className="field-wide"><span>Work rights, relocation or remote preferences</span><input value={workAuthorisation} onChange={(event) => setWorkAuthorisation(event.target.value)} placeholder="Countries, visa status, relocation or remote preference" /></label>
        </div>
      </details>

      <div className="direction-save-bar"><div><strong>{lanes.length ? `${lanes.length} priorit${lanes.length === 1 ? "y" : "ies"} ready to guide Sartho` : "Choose at least one direction when you are ready"}</strong><span>{status === "saved" ? "Career direction saved" : status === "error" ? "Could not save—please try again" : allocation === 100 && lanes.length ? "Search weighting is balanced automatically" : "Your current Career Profile remains unchanged until you save"}</span></div><button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save my career direction"}</button></div>
    </div>
  );
}
