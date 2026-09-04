"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GroundedDirectionSuggestion } from "@/lib/career/direction-suggestions";
import type { GroundedRoleRanking, MatchLevel } from "@/lib/career/direction-ranking";
import type { ProfileRecord, TargetLaneRecord } from "@/lib/types";

type LaneDraft = Pick<TargetLaneRecord, "id" | "name" | "weight" | "priority" | "active">;

const MATCH_LABEL: Record<MatchLevel, string> = {
  strong: "Strong match",
  moderate: "Partial match",
  stretch: "Stretch",
  unclear: "Unclear",
};
const MATCH_RANK: Record<MatchLevel, number> = { strong: 0, moderate: 1, stretch: 2, unclear: 3 };

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
  const router = useRouter();
  // Location, work rights and headline are edited on the Career Profile page
  // (the snapshot), not here — this screen is only about direction. They are
  // still sent through unchanged so a save never wipes them.
  const headline = initialProfile?.headline ?? "";
  const summary = initialProfile?.summary ?? "";
  const location = initialProfile?.location ?? "";
  const workAuthorisation = initialProfile?.work_authorisation ?? "";
  const [aiPrompt, setAiPrompt] = useState("");
  const [lanes, setLanes] = useState<LaneDraft[]>(() => balanceByPriority(initialLanes));
  const [laneDraft, setLaneDraft] = useState("");
  const [suggestions, setSuggestions] = useState<GroundedDirectionSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<GroundedRoleRanking[]>([]);
  const [rankStatus, setRankStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [rankError, setRankError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const visibleSuggestions = suggestions.filter((item) => !dismissed.includes(item.name));
  const rankingByName = useMemo(
    () => new Map(rankings.map((item) => [item.name.toLocaleLowerCase(), item])),
    [rankings],
  );
  const strongest = useMemo(
    () => (rankings.length ? [...rankings].sort((a, b) => MATCH_RANK[a.match] - MATCH_RANK[b.match])[0] : null),
    [rankings],
  );

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

  /* Reorder the priorities to lead with the roles the evidence backs most. */
  function applyRankedOrder() {
    if (!rankings.length) return;
    setLanes((items) => {
      const reordered = [...items].sort((a, b) => {
        const ra = rankingByName.get(a.name.toLocaleLowerCase());
        const rb = rankingByName.get(b.name.toLocaleLowerCase());
        return (ra ? MATCH_RANK[ra.match] : 99) - (rb ? MATCH_RANK[rb.match] : 99);
      });
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
          explorationPrompt: aiPrompt,
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

  async function rankRoles() {
    if (rankStatus === "loading" || !lanes.length) return;
    setRankStatus("loading");
    setRankError(null);
    try {
      const response = await fetch("/api/career/direction/rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lanes: lanes.map((lane) => lane.name), explorationPrompt: aiPrompt }),
      });
      const result = await response.json() as { rankings?: GroundedRoleRanking[]; error?: string };
      if (!response.ok || !result.rankings) throw new Error(result.error ?? "AI could not rank your roles.");
      setRankings(result.rankings);
      setRankStatus("ready");
    } catch (caught) {
      setRankError(caught instanceof Error ? caught.message : "AI could not rank your roles.");
      setRankStatus("error");
    }
  }

  /*
   * The point of this screen is to arrive and immediately see where your résumé
   * says you can go — not to hunt for a button. So when you land with a
   * confirmed profile and no priorities chosen yet, Sartho reads the résumé and
   * lists suggested directions on its own. The ref keeps it to one automatic
   * run per visit; the "Update suggestions" button drives any further passes.
   */
  const autoRequested = useRef(false);
  useEffect(() => {
    if (autoRequested.current) return;
    // Fire once on arrival whenever there is approved evidence and no
    // suggestions are on screen yet — regardless of whether priorities are
    // already chosen. Previously this was gated on having zero priorities,
    // which meant anyone returning with priorities set saw an empty panel and
    // no AI roles at all.
    if (evidenceCount > 0 && aiStatus === "idle" && suggestions.length === 0) {
      autoRequested.current = true;
      // Deferred out of the synchronous effect body so the first setState does
      // not cascade renders.
      const frame = requestAnimationFrame(() => void generateSuggestions());
      return () => cancelAnimationFrame(frame);
    }
    // generateSuggestions is a stable in-component handler; the ref guard, not
    // the dep list, controls the single automatic run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceCount, aiStatus, suggestions.length]);

  async function save() {
    // Guidance sharpens matching but never blocks: the priorities are the
    // point of this screen, so saving them always goes through.
    setStatus("saving");
    const strengths = initialProfile?.strengths?.length ? initialProfile.strengths : suggestedStrengths.slice(0, 12);
    const response = await fetch("/api/career/direction", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headline, summary, location, workAuthorisation, strengths, lanes }),
    });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.push("/search-plan");
      router.refresh();
    }
  }

  return (
    <div className="direction-workspace direction-ai-workspace">
      <section className="direction-ai-advisor" id="strengths">
        <div className="direction-ai-intro">
          <div>
            <span className="ai-orbit" aria-hidden="true">✦</span>
            <span className="direction-ai-label">Sartho AI career strategist</span>
          </div>
          <h2>Roles your résumé points to.</h2>
          <p>Grounded in the career facts you approved. Add the ones that fit — nothing joins your priorities until you choose it. You can add your own or ask AI to refine below.</p>
          <div className="direction-ai-grounding">
            <span><strong>{evidenceCount}</strong> approved career facts</span>
            <span><strong>{roleCount}</strong> roles understood</span>
            <span><strong>You decide</strong> what gets added</span>
          </div>
          {evidenceCount > 0 ? (
            <button type="button" className="direction-rank-button" onClick={() => void generateSuggestions()} disabled={aiStatus === "loading"} style={{ marginTop: "14px" }}>
              <span aria-hidden="true">↻</span> {aiStatus === "loading" ? "Re-analysing your résumé…" : "Refresh suggestions"}
            </button>
          ) : null}
          {evidenceCount === 0 ? <div className="direction-ai-message">Upload your résumé first so every suggestion has evidence behind it.</div> : null}
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
        ) : evidenceCount > 0 ? (
          <div className="direction-ai-message">
            <p style={{ margin: "0 0 12px" }}>
              {aiStatus === "error"
                ? "AI couldn’t generate roles just now."
                : aiStatus === "ready"
                  ? "No new roles to suggest right now — add your own or refine below."
                  : "See the roles your résumé points to."}
            </p>
            <button type="button" className="direction-rank-button" onClick={() => void generateSuggestions()}>
              <span aria-hidden="true">✦</span> {aiStatus === "error" ? "Try again" : "Generate roles from my résumé"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="glass-card direction-input-bar" aria-label="Add your own role or refine the suggestions">
        <div className="direction-input-col">
          <span className="direction-choice-label">Know the role you want? Add it directly</span>
          <div className="direction-manual-add">
            <input value={laneDraft} onChange={(event) => setLaneDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addManualLane())} placeholder="e.g. ServiceNow Senior Engagement Manager" />
            <button type="button" onClick={addManualLane}>Add role</button>
          </div>
        </div>
        <div className="direction-input-col">
          <span className="direction-choice-label">Not quite right? Ask AI to refine <em>optional</em></span>
          <div className="direction-ai-prompt">
            <textarea id="direction-goal" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} rows={2} placeholder="For example: regional leadership, less travel, more transformation ownership…" />
            <button type="button" onClick={() => void generateSuggestions()} disabled={aiStatus === "loading" || evidenceCount === 0}>
              <span aria-hidden="true">✦</span>
              {aiStatus === "loading" ? "Analysing…" : "Refine suggestions"}
            </button>
          </div>
        </div>
      </section>

      <section className="glass-card direction-priority-panel" id="priorities">
        <div className="direction-priority-heading">
          <div><span>Your decision</span><h2>Roles Sartho should prioritise</h2><p>Order them from most to least important, or let AI rank them against your résumé. Sartho balances the search weighting automatically.</p></div>
          <strong>{lanes.length}</strong>
        </div>

        {lanes.length ? (
          <div className="direction-rank-bar">
            <button type="button" className="direction-rank-button" onClick={() => void rankRoles()} disabled={rankStatus === "loading" || evidenceCount === 0}>
              <span aria-hidden="true">✦</span>
              {rankStatus === "loading" ? "Matching against your résumé…" : rankStatus === "ready" ? "Re-rank against my résumé" : "Rank these against my résumé"}
            </button>
            {strongest && strongest.match !== "unclear" ? (
              <p className="direction-rank-summary">
                Strongest match: <strong>{strongest.name}</strong> — {strongest.reason}
                <button type="button" className="direction-rank-apply" onClick={applyRankedOrder}>Use this order</button>
              </p>
            ) : null}
            {evidenceCount === 0 ? <p className="direction-rank-note">Upload your résumé first so the ranking has evidence behind it.</p> : null}
            {rankError ? <p className="direction-rank-note is-error" role="alert">{rankError}</p> : null}
          </div>
        ) : null}

        {lanes.length ? (
          <div className="direction-priority-list">
            {lanes.map((lane, index) => {
              const ranking = rankingByName.get(lane.name.toLocaleLowerCase());
              return (
                <article key={lane.id}>
                  <span className="priority-rank">{index + 1}</span>
                  <div>
                    <input aria-label={`Priority ${index + 1}`} value={lane.name} onChange={(event) => setLanes((items) => items.map((item) => item.id === lane.id ? { ...item, name: event.target.value } : item))} />
                    <small>{index === 0 ? "Highest priority" : `${lane.weight}% search emphasis`}</small>
                    {ranking ? (
                      <div className="priority-match">
                        <span className={`rank-badge rank-${ranking.match}`}>{MATCH_LABEL[ranking.match]}</span>
                        <p>{ranking.reason}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="priority-order-actions">
                    <button type="button" disabled={index === 0} onClick={() => moveLane(index, -1)} aria-label={`Move ${lane.name} up`}>↑</button>
                    <button type="button" disabled={index === lanes.length - 1} onClick={() => moveLane(index, 1)} aria-label={`Move ${lane.name} down`}>↓</button>
                    <button type="button" onClick={() => setLanes((items) => balanceByPriority(items.filter((item) => item.id !== lane.id)))} aria-label={`Remove ${lane.name}`}>×</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="direction-priority-empty"><strong>No priorities selected yet</strong><span>Choose an AI suggestion above or add the first role yourself.</span></div>
        )}

      </section>

      <div className="direction-save-bar">
        {status === "error" ? <span className="direction-save-status is-error" role="alert">Could not save — please try again</span> : status === "saved" ? <span className="direction-save-status">Saved ✓</span> : null}
        <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving" || !lanes.length}>{status === "saving" ? "Saving…" : "Save and continue"}</button>
      </div>
    </div>
  );
}
