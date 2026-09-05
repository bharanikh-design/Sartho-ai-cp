"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const manualInputRef = useRef<HTMLInputElement>(null);

  /*
   * The suggestions sit on a horizontal rail: as many cards as the AI returns,
   * three or so visible at a time, arrows to move by a page. Six cards in a
   * grid was already a wall; twelve would have been a scroll of walls.
   */
  const railRef = useRef<HTMLDivElement>(null);
  const [rail, setRail] = useState({ page: 1, pages: 1, canPrev: false, canNext: false });
  const measureRail = useCallback(() => {
    const element = railRef.current;
    if (!element) return;
    const width = element.clientWidth || 1;
    const pages = Math.max(1, Math.ceil(element.scrollWidth / width));
    const page = Math.min(pages, Math.round(element.scrollLeft / width) + 1);
    setRail({
      page,
      pages,
      canPrev: element.scrollLeft > 4,
      canNext: element.scrollLeft + width < element.scrollWidth - 4,
    });
  }, []);
  function scrollRail(direction: -1 | 1) {
    const element = railRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth, behavior: "smooth" });
  }

  function focusManualAdd() {
    manualInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    manualInputRef.current?.focus();
  }

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

  useEffect(() => {
    measureRail();
    window.addEventListener("resize", measureRail);
    return () => window.removeEventListener("resize", measureRail);
  }, [measureRail, visibleSuggestions.length, aiStatus]);

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
      {/*
        Two ways in, side by side and equal in weight. Before this, "add your
        own role" lived in a dim bar under six AI cards and read as an
        afterthought; the person who already knows the role they want had to
        scroll past everything to find it.
      */}
      <div className="direction-paths" aria-label="Two ways to choose your direction">
        <a className="direction-path is-ai" href="#suggestions">
          <span className="direction-choice-label">Path A · Let AI suggest</span>
          <strong>See the roles your résumé points to</strong>
          <p>
            {evidenceCount === 0
              ? "Upload your résumé first so every suggestion has evidence behind it."
              : aiStatus === "loading"
                ? "Reading your approved career facts…"
                : visibleSuggestions.length
                  ? `${visibleSuggestions.length} roles found from ${evidenceCount} approved career facts. Add the ones that fit.`
                  : `Grounded in ${evidenceCount} approved career facts across ${roleCount} roles.`}
          </p>
          <span className="direction-path-cta">{visibleSuggestions.length ? "Review suggestions ↓" : "Generate suggestions ↓"}</span>
        </a>
        <div className="direction-path is-manual">
          <span className="direction-choice-label">Path B · I already know the role</span>
          <strong>Know the role you want? Add it directly.</strong>
          <p>Type it exactly as you would search for it. It joins your priorities alongside anything you take from AI.</p>
          <div className="direction-manual-add">
            <input
              ref={manualInputRef}
              aria-label="Role to add"
              value={laneDraft}
              onChange={(event) => setLaneDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addManualLane())}
              placeholder="e.g. ServiceNow Senior Engagement Manager"
            />
            <button type="button" onClick={addManualLane} disabled={!laneDraft.trim()}>Add role</button>
          </div>
        </div>
      </div>

      <section className="direction-ai-advisor" id="suggestions">
        {/*
          Header → rail of cards → steer. The header only names the section and
          holds the rail arrows; the "not quite right?" control sits *after* the
          cards, at the moment a person has seen them and knows what to change.
        */}
        <div className="direction-ai-intro is-compact">
          <div className="direction-ai-intro-row">
            <div>
              <div>
                <span className="ai-orbit" aria-hidden="true">✦</span>
                <span className="direction-ai-label">Path A · Sartho AI career strategist</span>
              </div>
              <h2>Roles your résumé points to</h2>
              <p>
                {evidenceCount > 0
                  ? `Grounded in ${evidenceCount} approved career facts across ${roleCount} roles. Nothing joins your priorities until you choose it.`
                  : "Upload your résumé first so every suggestion has evidence behind it."}
              </p>
            </div>
            {visibleSuggestions.length > 0 && aiStatus !== "loading" ? (
              <div className="direction-rail-nav" aria-label="Browse suggestions">
                <span className="direction-rail-count" aria-live="polite">{rail.page} of {rail.pages}</span>
                <button type="button" onClick={() => scrollRail(-1)} disabled={!rail.canPrev} aria-label="Previous suggestions">‹</button>
                <button type="button" onClick={() => scrollRail(1)} disabled={!rail.canNext} aria-label="Next suggestions">›</button>
              </div>
            ) : null}
          </div>
          {aiError ? <div className="direction-ai-message is-error" role="alert">{aiError}</div> : null}
        </div>

        {aiStatus === "loading" ? (
          <div className="direction-suggestion-rail" aria-label="Generating career suggestions">
            {[1, 2, 3].map((item) => <div key={item} className="direction-suggestion-card direction-suggestion-skeleton" />)}
          </div>
        ) : visibleSuggestions.length ? (
          <div className="direction-suggestion-rail" ref={railRef} onScroll={measureRail} tabIndex={0} aria-live="polite">
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
          <div className="direction-ai-message" style={{ margin: "0 26px 22px" }}>
            <p style={{ margin: "0 0 12px" }}>
              {aiStatus === "error"
                ? "AI couldn’t generate roles just now."
                : aiStatus === "ready"
                  ? "No new roles to suggest right now — steer the AI below, or add your own role in Path B."
                  : "See the roles your résumé points to."}
            </p>
            <button type="button" className="direction-rank-button" onClick={() => void generateSuggestions()}>
              <span aria-hidden="true">✦</span> {aiStatus === "error" ? "Try again" : "Generate roles from my résumé"}
            </button>
          </div>
        ) : null}

        {evidenceCount > 0 ? (
          <div className="direction-ai-steer">
            <label htmlFor="direction-goal" className="direction-ai-steer-label">
              Not quite right? <em>Tell the AI what to change (optional)</em>
            </label>
            <input
              id="direction-goal"
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), void generateSuggestions())}
              placeholder="e.g. less travel, regional leadership, more transformation ownership"
            />
            <button type="button" className="direction-rank-button" onClick={() => void generateSuggestions()} disabled={aiStatus === "loading"}>
              <span aria-hidden="true">{aiPrompt.trim() ? "✦" : "↻"}</span>
              {aiStatus === "loading" ? "Re-analysing…" : aiPrompt.trim() ? "Refine suggestions" : "Refresh suggestions"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="glass-card direction-priority-panel" id="priorities">
        <div className="direction-priority-heading">
          <div><span>Your decision</span><h2>Roles Sartho should prioritise</h2><p>Everything you add from Path A or Path B lands here. Order them from most to least important, or let AI rank them against your résumé. Sartho balances the search weighting automatically.</p></div>
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
            <button type="button" className="direction-priority-add-more" onClick={focusManualAdd}>+ Add another role</button>
          </div>
        ) : (
          <div className="direction-priority-empty">
            <strong>No priorities selected yet</strong>
            <span>Take a role from the AI suggestions, or <button type="button" className="direction-inline-link" onClick={focusManualAdd}>add the first one yourself</button>.</span>
          </div>
        )}

      </section>

      <div className="direction-save-bar">
        {status === "error" ? <span className="direction-save-status is-error" role="alert">Could not save — please try again</span> : status === "saved" ? <span className="direction-save-status">Saved ✓</span> : null}
        <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving" || !lanes.length}>{status === "saving" ? "Saving…" : "Save and continue"}</button>
      </div>
    </div>
  );
}
