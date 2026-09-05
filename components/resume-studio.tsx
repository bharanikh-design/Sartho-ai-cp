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
              const ats = scoreAts(shownText, draft.analysis);
              const currentAts = scoreAts(draft.application.resume_draft ?? "", draft.analysis);
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
                        <pre>{shownText}</pre>
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
                        {ats.missingKeywords.length ? (
                          <div className="studio-ats-missing">
                            <strong>Terms this role uses that your draft does not</strong>
                            <div className="chip-row">
                              {ats.missingKeywords.slice(0, 8).map((keyword) => <span className="signal-chip" key={keyword}>{keyword}</span>)}
                            </div>
                            <small>Only add one where your approved evidence genuinely supports it. A keyword you cannot back is a lie that survives the filter and fails the interview.</small>
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
