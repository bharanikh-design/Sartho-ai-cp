"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { scoreAts } from "@/lib/resume/ats";
import type { ApplicationRecord, ResumeChange, ResumeVersionRecord, RuleAnalysis } from "@/lib/types";

/*
 * Résumé Studio does two things: make a résumé, and check how it will read to
 * an applicant tracking system. Nothing else.
 *
 * It used to open with a three-step tracker and a queue of saved roles whose
 * analysis was unfinished, each with a "Complete analysis" button that led
 * away to the job pages. That is opportunity work wearing a résumé label — it
 * put a chase list in front of someone who came here to write, and it made the
 * page's purpose unreadable.
 */

export type StudioDraft = {
  application: ApplicationRecord;
  jobId: string;
  jobTitle: string;
  employer: string | null;
  analysis: RuleAnalysis | null;
  /** Every draft ever generated for this role, newest first. */
  history: ResumeVersionRecord[];
};

export type TailorableRole = {
  id: string;
  title: string;
  employer: string | null;
};

const stateTone: Record<"pass" | "warn" | "fail", string> = {
  pass: "#6bcf93",
  warn: "#e0b061",
  fail: "#e5917a",
};

export function ResumeStudio({
  drafts,
  tailorable,
  hasAnyJobs,
  evidenceReady,
}: {
  drafts: StudioDraft[];
  /** Roles whose analysis is finished, so a truthful draft can be built. */
  tailorable: TailorableRole[];
  hasAnyJobs: boolean;
  /** Whether any approved, résumé-safe career fact exists to write from. */
  evidenceReady: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(drafts[0]?.application.id ?? null);
  /* Which saved version is being read, by draft id. Absent means the current one. */
  const [viewing, setViewing] = useState<Record<string, string>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * The improvement loop, per draft. `facts` is what the person typed for a
   * bullet, `rewrites` is what came back and has not been accepted yet, and
   * `accepted` is what will be written when they save. Nothing is persisted
   * until Save, so abandoning a half-finished edit costs nothing.
   */
  const [openBullet, setOpenBullet] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [rewrites, setRewrites] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState<Record<string, Record<number, string>>>({});
  const [busyBullet, setBusyBullet] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  /** The draft as it stands with every accepted rewrite applied. */
  function withAccepted(draft: StudioDraft, text: string) {
    const edits = accepted[draft.application.id];
    if (!edits) return text;
    let seen = -1;
    return text
      .split("\n")
      .map((line) => {
        if (!line.trim().startsWith("•")) return line;
        seen += 1;
        const replacement = edits[seen];
        return replacement ? `• ${replacement}` : line;
      })
      .join("\n");
  }

  async function improve(draft: StudioDraft, bullet: { index: number; text: string }) {
    const key = `${draft.application.id}:${bullet.index}`;
    const fact = (facts[key] ?? "").trim();
    if (!fact || busyBullet) return;
    setBusyBullet(key);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${draft.jobId}/resume/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bullet: bullet.text, fact }),
      });
      const result = await response.json() as { rewritten?: string; error?: string };
      if (!response.ok || !result.rewritten) throw new Error(result.error ?? "Sartho could not rewrite this line.");
      setRewrites((state) => ({ ...state, [key]: result.rewritten as string }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not rewrite this line.");
    } finally {
      setBusyBullet(null);
    }
  }

  async function saveVersion(draft: StudioDraft, text: string) {
    const edits = accepted[draft.application.id];
    if (!edits || savingId) return;
    setSavingId(draft.application.id);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${draft.jobId}/resume/version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: withAccepted(draft, text),
          changes: Object.values(edits).map((line) => ({
            type: "reworded" as const,
            description: `Quantified from a figure you supplied: ${line.slice(0, 160)}`,
            evidenceIds: [],
          })),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not save this version.");
      setAccepted((state) => ({ ...state, [draft.application.id]: {} }));
      setRewrites({});
      setFacts({});
      setOpenBullet(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not save this version.");
    } finally {
      setSavingId(null);
    }
  }

  async function generate(jobId: string) {
    if (generatingId) return;
    setGeneratingId(jobId);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to draft the résumé.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to draft the résumé.");
    } finally {
      setGeneratingId(null);
    }
  }

  async function copy(text: string, draftId: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedId(draftId);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <section className="glass-card content-card" id="drafts">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Your résumés</h2>
            <p className="section-subtitle">Each draft is built only from evidence you approved. Every version is kept, so you can compare and go back.</p>
          </div>
          <span className="meta-pill">{drafts.length} draft{drafts.length === 1 ? "" : "s"}</span>
        </div>

        {drafts.length ? (
          <div className="studio-draft-list">
            {drafts.map((draft) => {
              const open = openId === draft.application.id;
              /*
               * Every generated draft is kept now, so the reader shows whichever
               * version is selected — with its own ATS score, which is the only
               * way to see whether an edit actually made things better.
               */
              const chosen = draft.history.find((version) => version.id === viewing[draft.application.id]);
              const current = draft.history[0];
              const shownText = chosen?.draft ?? draft.application.resume_draft ?? "";
              const shownLog: ResumeChange[] = chosen?.change_log ?? draft.application.resume_change_log;
              const edited = withAccepted(draft, shownText);
              const ats = scoreAts(edited, draft.analysis);
              const currentAts = scoreAts(draft.application.resume_draft ?? "", draft.analysis);
              /* Weak lines are read from the unedited text so indexes stay stable. */
              const atsWeak = scoreAts(shownText, draft.analysis).weakBullets;
              const acceptedCount = Object.keys(accepted[draft.application.id] ?? {}).length;
              return (
                <article className={`studio-draft${open ? " is-open" : ""}`} key={draft.application.id}>
                  <button
                    type="button"
                    className="studio-draft-head"
                    onClick={() => setOpenId(open ? null : draft.application.id)}
                    aria-expanded={open}
                  >
                    <span className="studio-draft-name">
                      <strong>{draft.application.resume_version ?? draft.jobTitle}</strong>
                      <small>
                        {draft.employer ?? "Employer not recorded"}
                        {draft.history.length > 1 ? <> · {draft.history.length} versions</> : null}
                        {" · "}{draft.application.resume_change_log.length} changes logged
                      </small>
                    </span>
                    <span className="studio-ats-badge" style={{ color: stateTone[currentAts.score >= 70 ? "pass" : currentAts.score >= 40 ? "warn" : "fail"] }}>
                      {currentAts.score}<small>ATS</small>
                    </span>
                    <span aria-hidden="true" className="studio-draft-chevron">{open ? "▲" : "▼"}</span>
                  </button>

                  {open ? (
                    <div className="studio-draft-body">
                      <div className="studio-draft-reader">
                        {draft.history.length > 1 ? (
                          <div className="studio-version-rail" role="group" aria-label="Résumé versions">
                            {draft.history.map((version) => {
                              const isShown = version.id === (chosen?.id ?? current?.id);
                              const versionAts = scoreAts(version.draft, draft.analysis);
                              return (
                                <button
                                  type="button"
                                  key={version.id}
                                  className={`studio-version${isShown ? " is-shown" : ""}`}
                                  aria-pressed={isShown}
                                  onClick={() => setViewing((state) => ({ ...state, [draft.application.id]: version.id }))}
                                >
                                  <strong>v{version.version_number}</strong>
                                  <small>{versionAts.score} ATS</small>
                                  <small>{new Date(version.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="resume-draft-label">
                          {chosen && chosen.id !== current?.id
                            ? <>Version {chosen.version_number} — an earlier draft, kept for comparison</>
                            : <>Draft — review before use</>}
                        </div>
                        <pre>{withAccepted(draft, shownText)}</pre>
                        <div className="studio-draft-actions">
                          <button type="button" className="secondary-button" onClick={() => void copy(shownText, draft.application.id)}>
                            {copiedId === draft.application.id ? "Copied ✓" : "Copy draft"}
                          </button>
                          <button type="button" className="secondary-button" onClick={() => void generate(draft.jobId)} disabled={generatingId === draft.jobId}>
                            {generatingId === draft.jobId ? "Regenerating…" : "Regenerate"}
                          </button>
                          <small className="studio-regenerate-note">Regenerating keeps this version — it is added as a new one.</small>
                        </div>
                      </div>

                      <aside className="studio-ats">
                        <h3>ATS check</h3>
                        <ul className="studio-ats-checks">
                          {ats.checks.map((check) => (
                            <li key={check.label}>
                              <span style={{ color: stateTone[check.state] }} aria-hidden="true">
                                {check.state === "pass" ? "✓" : check.state === "warn" ? "!" : "×"}
                              </span>
                              <div><strong>{check.label}</strong><small>{check.detail}</small></div>
                            </li>
                          ))}
                        </ul>
                        {ats.unusedStrengths.length ? (
                          <div className="studio-ats-missing">
                            <strong>Strengths you can back that the draft never names</strong>
                            <div className="chip-row">
                              {ats.unusedStrengths.slice(0, 8).map((term) => <span className="signal-chip" key={term}>{term}</span>)}
                            </div>
                            <small>Your approved evidence supports every one of these. Regenerate, or work them into a line yourself.</small>
                          </div>
                        ) : null}

                        {/*
                          * Stated, never suggested. These are things the role
                          * wants that the evidence cannot back — putting one in
                          * the draft would be a lie that survives the filter and
                          * fails the interview.
                          */}
                        {ats.unbackedRequirements.length ? (
                          <div className="studio-ats-unbacked">
                            <strong>What this role wants that you cannot evidence</strong>
                            <div className="chip-row">
                              {ats.unbackedRequirements.slice(0, 8).map((term) => <span className="signal-chip is-caution" key={term}>{term}</span>)}
                            </div>
                            <small>Do not add these to the draft. They are the honest reason this role is a stretch, not a gap to write over.</small>
                          </div>
                        ) : null}

                        {atsWeak.length ? (
                          <div className="studio-fixes">
                            <strong>Lines worth a number</strong>
                            <small>Sartho will not invent a figure. Tell it what actually happened and it rewrites the line around your words.</small>
                            {atsWeak.map((bullet) => {
                              const key = `${draft.application.id}:${bullet.index}`;
                              const isOpen = openBullet === key;
                              const rewritten = rewrites[key];
                              const isAccepted = Boolean(accepted[draft.application.id]?.[bullet.index]);
                              return (
                                <div className={`studio-fix${isAccepted ? " is-accepted" : ""}`} key={key}>
                                  <button
                                    type="button"
                                    className="studio-fix-line"
                                    onClick={() => setOpenBullet(isOpen ? null : key)}
                                    aria-expanded={isOpen}
                                  >
                                    {isAccepted ? "✓ " : ""}{bullet.text}
                                  </button>
                                  {isOpen && !isAccepted ? (
                                    <div className="studio-fix-form">
                                      <label htmlFor={`fact-${key}`}>
                                        What was the number, scale or result? Plain words are fine.
                                      </label>
                                      <textarea
                                        id={`fact-${key}`}
                                        rows={2}
                                        placeholder="about 40,000 rows, over six weeks, for a team of 3"
                                        value={facts[key] ?? ""}
                                        onChange={(event) => setFacts((state) => ({ ...state, [key]: event.target.value }))}
                                      />
                                      <button
                                        type="button"
                                        className="secondary-button"
                                        disabled={!(facts[key] ?? "").trim() || busyBullet === key}
                                        onClick={() => void improve(draft, bullet)}
                                      >
                                        {busyBullet === key ? "Rewriting…" : "Rewrite this line"}
                                      </button>
                                      {rewritten ? (
                                        <div className="studio-fix-result">
                                          <p>{rewritten}</p>
                                          <div>
                                            <button
                                              type="button"
                                              className="primary-button"
                                              onClick={() => {
                                                setAccepted((state) => ({
                                                  ...state,
                                                  [draft.application.id]: {
                                                    ...(state[draft.application.id] ?? {}),
                                                    [bullet.index]: rewritten,
                                                  },
                                                }));
                                                setOpenBullet(null);
                                              }}
                                            >
                                              Use this
                                            </button>
                                            <button
                                              type="button"
                                              className="secondary-button"
                                              onClick={() => setRewrites((state) => ({ ...state, [key]: "" }))}
                                            >
                                              Discard
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}

                            {acceptedCount ? (
                              <div className="studio-fix-save">
                                <span>{acceptedCount} line{acceptedCount === 1 ? "" : "s"} rewritten, not yet saved.</span>
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={savingId === draft.application.id}
                                  onClick={() => void saveVersion(draft, shownText)}
                                >
                                  {savingId === draft.application.id ? "Saving…" : "Save as a new version"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {shownLog.length ? (
                          <details className="studio-change-log">
                            <summary>What AI changed ({shownLog.length})</summary>
                            <ul>
                              {shownLog.map((change, index) => (
                                <li key={index}><strong>{change.type}</strong> {change.description}</li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </aside>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-inline-state">
            No résumés yet. Build one from an analysed role below.
          </div>
        )}
      </section>

      <section className="glass-card content-card" id="create">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Build a new résumé</h2>
            <p className="section-subtitle">Pick a role whose requirements Sartho has already read. The draft uses only approved evidence.</p>
          </div>
        </div>

        {!evidenceReady ? (
          /*
           * The drafting route refuses without approved, résumé-safe evidence.
           * Say so here rather than letting the button fail.
           */
          <div className="empty-inline-state">
            There are no approved career facts to write from yet. Upload your résumé in <Link href="/career-truth">Career Truth</Link> first.
          </div>
        ) : tailorable.length ? (
          <div className="studio-role-list">
            {tailorable.map((role) => (
              <article key={role.id}>
                <div><strong>{role.title}</strong><small>{role.employer ?? "Employer not recorded"}</small></div>
                <button type="button" className="primary-button" onClick={() => void generate(role.id)} disabled={Boolean(generatingId)}>
                  {generatingId === role.id ? "Drafting…" : "Build résumé"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          /*
           * One sentence and one link, not a queue of unfinished work. Chasing
           * role analysis belongs in Applications, which is where this points.
           */
          <div className="empty-inline-state">
            {hasAnyJobs
              ? <>None of your saved roles have been analysed yet. Run the analysis on one in <Link href="/applications">Applications</Link>, then come back.</>
              : <>Save a role in <Link href="/applications">Applications</Link> first — a résumé is tailored to one real advert, not written in the abstract.</>}
          </div>
        )}
      </section>
    </>
  );
}
