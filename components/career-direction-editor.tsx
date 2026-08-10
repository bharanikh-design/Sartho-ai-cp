"use client";

import { useMemo, useRef, useState } from "react";
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
  const [headline, setHeadline] = useState(initialProfile?.headline ?? "");
  const [summary] = useState(initialProfile?.summary ?? "");
  const [location, setLocation] = useState(initialProfile?.location ?? "");
  const [workAuthorisation, setWorkAuthorisation] = useState(initialProfile?.work_authorisation ?? "");
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
  const [guidanceError, setGuidanceError] = useState<string | null>(null);

  const guidanceRef = useRef<HTMLDetailsElement>(null);
  const headlineRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const workRef = useRef<HTMLInputElement>(null);

  const allocation = useMemo(() => lanes.reduce((sum, lane) => sum + lane.weight, 0), [lanes]);
  const visibleSuggestions = suggestions.filter((item) => !dismissed.includes(item.name));
  const rankingByName = useMemo(
    () => new Map(rankings.map((item) => [item.name.toLocaleLowerCase(), item])),
    [rankings],
  );
  const strongest = useMemo(
    () => (rankings.length ? [...rankings].sort((a, b) => MATCH_RANK[a.match] - MATCH_RANK[b.match])[0] : null),
    [rankings],
  );
  const missingGuidance = !headline.trim() || !location.trim() || !workAuthorisation.trim();

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

  async function save() {
    /*
     * The three guidance fields are required. Rather than silently disabling
     * the button (which reads as "nothing happens"), the save is attempted and,
     * if guidance is missing, the section is opened, scrolled to and focused so
     * the reason is impossible to miss.
     */
    if (missingGuidance) {
      setGuidanceError("Add your role, location and work rights below before saving.");
      if (guidanceRef.current) {
        guidanceRef.current.open = true;
        guidanceRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const firstMissing = !headline.trim() ? headlineRef : !location.trim() ? locationRef : workRef;
      window.setTimeout(() => firstMissing.current?.focus(), 320);
      return;
    }

    setGuidanceError(null);
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
          <h2>Let your résumé suggest where you can go next.</h2>
          <p>AI reads only the career facts you approved, proposes direct, adjacent and stretch paths, and shows the evidence behind each one. Nothing joins your priorities until you choose it.</p>
          <div className="direction-ai-grounding">
            <span><strong>{evidenceCount}</strong> approved career facts</span>
            <span><strong>{roleCount}</strong> roles understood</span>
            <span><strong>You decide</strong> what gets added</span>
          </div>
          <div className="capability-note">
            <strong>Generative AI · grounded suggestion</strong>
            <span>This creates new career-path ideas from your approved profile. It is not a prediction, and nothing is saved until you add it.</span>
          </div>
          <div className="direction-choice-grid">
            <section>
              <span className="direction-choice-label">I know the role I want</span>
              <strong>Add it directly</strong>
              <p>The role enters your priorities immediately. AI does not need to reinterpret it.</p>
              <div className="direction-manual-add">
                <input value={laneDraft} onChange={(event) => setLaneDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addManualLane())} placeholder="e.g. ServiceNow Senior Engagement Manager" />
                <button type="button" onClick={addManualLane}>Add target role</button>
              </div>
            </section>
            <section>
              <span className="direction-choice-label">Help me explore</span>
              <strong>Ask AI for possibilities</strong>
              <p>Describe what should change or matter next. AI will update the suggestions; it will not add anything automatically.</p>
              <div className="direction-ai-prompt">
                <label htmlFor="direction-goal">Exploration request <span>Optional</span></label>
                <textarea id="direction-goal" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} rows={2} placeholder="For example: regional leadership, less travel, more transformation ownership…" />
                <button type="button" onClick={() => void generateSuggestions()} disabled={aiStatus === "loading" || evidenceCount === 0}>
                  <span aria-hidden="true">✦</span>
                  {aiStatus === "loading" ? "Analysing…" : aiStatus === "ready" ? "Update suggestions" : "Generate suggestions"}
                </button>
              </div>
            </section>
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
            {evidenceCount === 0 ? <p className="direction-rank-note">Confirm your Career Profile first so the ranking has evidence behind it.</p> : null}
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

      <details className="glass-card direction-preferences" id="context" ref={guidanceRef} open>
        <summary><span><strong>Complete your guidance</strong><small>Required context for relevant opportunity decisions</small></span><span>Review</span></summary>
        <div className="direction-fields">
          <label><span>Role or level already in mind · Required</span><input ref={headlineRef} value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="e.g. Regional Transformation Director" /></label>
          <label><span>Current location · Required</span><input ref={locationRef} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Singapore" /></label>
          <label className="field-wide"><span>Work rights and mobility · Required</span><input ref={workRef} value={workAuthorisation} onChange={(event) => setWorkAuthorisation(event.target.value)} placeholder="Countries, visa status, relocation or remote preference" /></label>
        </div>
        {guidanceError ? <div className="direction-ai-message is-error" role="alert">{guidanceError}</div> : null}
      </details>

      <div className="direction-save-bar"><div><strong>{lanes.length ? `${lanes.length} priorit${lanes.length === 1 ? "y" : "ies"} ready to guide Sartho` : "Choose at least one direction when you are ready"}</strong><span>{status === "saved" ? "Career direction saved" : status === "error" ? "Could not save—please try again" : missingGuidance ? "Complete the three required guidance fields before saving" : allocation === 100 && lanes.length ? "Search weighting is balanced automatically" : "Your current Career Profile remains unchanged until you save"}</span></div><button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving" || !lanes.length}>{status === "saving" ? "Saving…" : "Save and continue"}</button></div>
    </div>
  );
}
