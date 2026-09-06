"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { scoreAts } from "@/lib/resume/ats";
import { unfilledBlanks } from "@/lib/resume/bullet-rewrite";
import { renderResumeText, resumeContentOf, type ResumeContent } from "@/lib/resume/content";
import { ResumeDocument } from "@/components/resume-document";
import { ResumeWorkbench } from "@/components/resume-workbench";
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
  analysedCount,
  evidenceReady,
}: {
  drafts: StudioDraft[];
  /** Roles whose analysis is finished, so a truthful draft can be built. */
  tailorable: TailorableRole[];
  hasAnyJobs: boolean;
  /** Roles that have been analysed at all, drafted or not. */
  analysedCount: number;
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
   * The document being edited, keyed by draft and version.
   *
   * Absent means "unchanged from what was saved", so an untouched draft costs
   * nothing and switching versions cannot leak one document's edits onto
   * another. Nothing is persisted until Save, so abandoning a half-finished
   * edit costs nothing either.
   */
  const [documents, setDocuments] = useState<Record<string, ResumeContent>>({});

  const [openBullet, setOpenBullet] = useState<string | null>(null);
  /*
   * Sartho drafts first, and the person edits. `proposals` holds the editable
   * line, `asked` the questions that would strengthen it. Both cached per
   * bullet, so reopening one never spends again.
   */
  const [proposals, setProposals] = useState<Record<string, string>>({});
  const [asked, setAsked] = useState<Record<string, string[]>>({});
  /* Why a proposal failed, kept per bullet so it is shown at the line it belongs to. */
  const [proposalError, setProposalError] = useState<Record<string, string>>({});
  const [busyBullet, setBusyBullet] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  /*
   * The expanded editor. The inline panel is a squeezed two-column strip; a
   * résumé is a document and wants the width. Same workspace either way — the
   * body is rendered once and placed in whichever container is showing.
   */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /*
   * A proposal is fetched when a line is opened, not behind another button: a
   * suggestion you have to ask for twice is not a suggestion. Every figure the
   * model cannot know comes back as a labelled blank, so it goes first without
   * inventing.
   *
   * The guard used to include `|| busyBullet`, which meant opening a second
   * line while the first was still in flight silently did nothing at all — and
   * a failed request left the panel reading "Nothing drafted yet." forever,
   * with the reason in a banner at the top of the page and no way to retry.
   * A dead end that says nothing is worse than an error.
   */
  async function propose(draft: StudioDraft, bullet: { id: string; text: string }, force = false) {
    const key = `${draft.application.id}:${bullet.id}`;
    if (busyBullet === key) return;
    if (proposals[key] !== undefined && !force) return;
    setBusyBullet(key);
    setProposalError((state) => { const next = { ...state }; delete next[key]; return next; });
    try {
      const response = await fetch(`/api/jobs/${draft.jobId}/resume/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bullet: bullet.text }),
      });
      const result = await response.json() as { rewritten?: string; questions?: string[]; error?: string };
      if (!response.ok || !result.rewritten) throw new Error(result.error ?? "Sartho could not draft this line.");
      setProposals((state) => ({ ...state, [key]: result.rewritten as string }));
      setAsked((state) => ({ ...state, [key]: result.questions ?? [] }));
    } catch (caught) {
      setProposalError((state) => ({
        ...state,
        [key]: caught instanceof Error ? caught.message : "Sartho could not draft this line.",
      }));
    } finally {
      setBusyBullet(null);
    }
  }

  function openBulletAt(draft: StudioDraft, bullet: { id: string; text: string }) {
    const key = `${draft.application.id}:${bullet.id}`;
    const next = openBullet === key ? null : key;
    setOpenBullet(next);
    if (next) void propose(draft, bullet);
  }

  async function saveVersion(draft: StudioDraft, documentKey: string, content: ResumeContent, changes: ResumeChange[]) {
    if (savingId) return;
    setSavingId(draft.application.id);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${draft.jobId}/resume/version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, changes }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not save this version.");
      setDocuments((state) => { const next = { ...state }; delete next[documentKey]; return next; });
      setProposals({});
      setAsked({});
      setProposalError({});
      setOpenBullet(null);
      setViewing((state) => { const next = { ...state }; delete next[draft.application.id]; return next; });
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

  /* Escape closes the expanded editor, and the page behind it does not scroll. */
  useEffect(() => {
    if (!expandedId) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpandedId(null); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [expandedId]);

  async function copy(text: string, draftId: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedId(draftId);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  /*
   * One workspace, two containers. The inline panel and the expanded editor
   * render exactly the same thing — a résumé being improved should not behave
   * differently because of how much room it has.
   */
  function renderWorkspace(draft: StudioDraft) {
    const chosen = draft.history.find((version) => version.id === viewing[draft.application.id]);
    const current = draft.history[0];
    const isOlderVersion = Boolean(chosen && chosen.id !== current?.id);

    const storedText = chosen?.draft ?? draft.application.resume_draft ?? "";
    const storedContent = chosen ? chosen.content : draft.application.resume_content;
    const shownLog: ResumeChange[] = chosen?.change_log ?? draft.application.resume_change_log;

    /*
     * Structure when it was stored, and the text column read back into
     * structure when it was not — so a draft generated before any of this
     * existed opens in the same editor as one generated today.
     */
    const documentKey = `${draft.application.id}:${chosen?.id ?? "current"}`;
    const saved = resumeContentOf(storedContent, storedText);
    const edits = documents[documentKey];
    const content = edits ?? saved;

    if (!content) {
      return (
        <div className="studio-draft-body">
          <div className="empty-inline-state">This draft is empty. Regenerate it to start again.</div>
        </div>
      );
    }

    const text = renderResumeText(content);
    const dirty = Boolean(edits) && text !== storedText;
    const ats = scoreAts(text, draft.analysis);

    /*
     * The ATS reader works on text and reports positions. renderResumeText
     * emits bullets in document order, so the nth bullet it counted is the nth
     * bullet here — which is what lets a flagged line be marked in the document
     * and opened from the rail.
     */
    const flatBullets = content.sections.flatMap((section) => section.bullets);
    const weak = ats.weakBullets
      .map((bullet) => ({ bullet: flatBullets[bullet.index], text: bullet.text }))
      .filter((entry): entry is { bullet: typeof flatBullets[number]; text: string } => Boolean(entry.bullet));
    const weakBulletIds = new Set(weak.map((entry) => entry.bullet.id));

    function setContent(next: ResumeContent) {
      setDocuments((state) => ({ ...state, [documentKey]: next }));
    }

    /* Written from the document itself, so the log records what actually changed. */
    function changesFor(next: ResumeContent): ResumeChange[] {
      const before = new Map((saved?.sections ?? []).flatMap((section) => section.bullets).map((bullet) => [bullet.id, bullet.text]));
      return next.sections
        .flatMap((section) => section.bullets)
        .filter((bullet) => before.has(bullet.id) && before.get(bullet.id) !== bullet.text)
        .slice(0, 60)
        .map((bullet) => ({
          type: "reworded" as const,
          description: `Edited in Résumé Studio: ${bullet.text.slice(0, 160)}`,
          evidenceIds: bullet.evidenceIds,
        }));
    }

    return (
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
            {isOlderVersion
              ? <>Version {chosen?.version_number} — an earlier draft, kept for comparison</>
              : dirty
                ? <>Editing — not saved yet</>
                : <>Draft — click any line to edit it</>}
          </div>

          {/*
            * An older version is history and stays readable rather than
            * editable: editing one would make the record of what you sent
            * somewhere a worse record than no record at all.
            */}
          <ResumeDocument
            content={content}
            onChange={setContent}
            weakBulletIds={weakBulletIds}
            readOnly={isOlderVersion}
          />

          <div className="studio-draft-actions">
            {dirty ? (
              <button
                type="button"
                className="primary-button"
                disabled={savingId === draft.application.id}
                onClick={() => void saveVersion(draft, documentKey, content, changesFor(content))}
              >
                {savingId === draft.application.id ? "Saving…" : "Save as a new version"}
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={() => void copy(text, draft.application.id)}>
              {copiedId === draft.application.id ? "Copied ✓" : "Copy draft"}
            </button>
            <button type="button" className="secondary-button" onClick={() => void generate(draft.jobId)} disabled={generatingId === draft.jobId}>
              {generatingId === draft.jobId ? "Regenerating…" : "Regenerate"}
            </button>
            {dirty ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDocuments((state) => { const next = { ...state }; delete next[documentKey]; return next; })}
              >
                Discard edits
              </button>
            ) : null}
            <small className="studio-regenerate-note">
              {dirty
                ? "Your edits are not saved until you save them. Regenerating would replace them."
                : "Regenerating keeps this version — it is added as a new one."}
            </small>
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
            * Stated, never suggested. These are things the role wants that the
            * evidence cannot back — putting one in the draft would be a lie
            * that survives the filter and fails the interview.
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

          {weak.length && !isOlderVersion ? (
            <div className="studio-fixes">
              <strong>Lines worth a number</strong>
              <small>Sartho drafts the stronger version first, leaving a blank where it would otherwise have to guess. Fill those in, edit anything, then use it.</small>
              {weak.map(({ bullet }) => {
                const key = `${draft.application.id}:${bullet.id}`;
                const isOpen = openBullet === key;
                const proposal = proposals[key];
                const failed = proposalError[key];
                const blanks = proposal ? unfilledBlanks(proposal) : [];
                const questions = asked[key] ?? [];
                return (
                  <div className="studio-fix" key={key}>
                    <button
                      type="button"
                      className="studio-fix-line"
                      onClick={() => openBulletAt(draft, bullet)}
                      aria-expanded={isOpen}
                    >
                      {bullet.text}
                    </button>
                    {isOpen ? (
                      <div className="studio-fix-form">
                        {failed ? (
                          /*
                            * The reason, at the line it happened to, with a way
                            * forward. This used to read "Nothing drafted yet."
                            * and stay that way — the error was in a banner at
                            * the top of the page and there was no retry.
                            */
                          <div className="studio-fix-failed" role="alert">
                            <p>{failed}</p>
                            <button type="button" className="secondary-button" onClick={() => void propose(draft, bullet, true)}>
                              Try again
                            </button>
                          </div>
                        ) : proposal === undefined ? (
                          <p className="studio-fix-pending">Sartho is drafting a stronger version…</p>
                        ) : (
                          <>
                            <label htmlFor={`draft-${key}`}>
                              Sartho&rsquo;s version. Replace anything in [brackets] — it will not guess a figure for you.
                            </label>
                            <textarea
                              id={`draft-${key}`}
                              rows={3}
                              value={proposal}
                              onChange={(event) => setProposals((state) => ({ ...state, [key]: event.target.value }))}
                            />
                            {questions.length ? (
                              <ul className="studio-fix-questions">
                                {questions.map((question) => <li key={question}>{question}</li>)}
                              </ul>
                            ) : null}
                            <div className="studio-fix-actions">
                              <button
                                type="button"
                                className="primary-button"
                                disabled={blanks.length > 0 || !proposal.trim()}
                                onClick={() => {
                                  setContent({
                                    ...content,
                                    sections: content.sections.map((section) => ({
                                      ...section,
                                      bullets: section.bullets.map((entry) =>
                                        entry.id === bullet.id
                                          ? { ...entry, text: proposal.trim(), edited: true }
                                          : entry,
                                      ),
                                    })),
                                  });
                                  setOpenBullet(null);
                                }}
                              >
                                Use this line
                              </button>
                              <button type="button" className="secondary-button" onClick={() => setOpenBullet(null)}>
                                Leave it
                              </button>
                              {blanks.length ? <small>Still to fill: {blanks.join(", ")}</small> : null}
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
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
    );
  }

  const expanded = drafts.find((draft) => draft.application.id === expandedId) ?? null;

  /* Whether there is a role a truthful draft could be written for right now. */
  const canBuild = evidenceReady && tailorable.length > 0;

  /*
   * Why not, in one sentence, when there is nothing to build — said once, in
   * the place somebody notices the absence, rather than in a card of its own.
   *
   * Four situations and not one. The old copy told somebody with two finished
   * résumés that none of their roles had been analysed, and told somebody with
   * no approved evidence to go and analyse a role that would refuse to draft.
   */
  const blockedReason = canBuild
    ? null
    : !evidenceReady
      ? <>There are no approved career facts to write from yet. Upload your résumé in <Link href="/career-truth">Career Truth</Link> first.</>
      : !hasAnyJobs
        ? <>Save a role in <Link href="/applications">Opportunities</Link> first — a résumé is tailored to one real advert, not written in the abstract.</>
        : analysedCount === 0
          ? <>None of your saved roles have been analysed yet. Run the analysis on one in <Link href="/applications">Opportunities</Link>, then come back.</>
          : <>Every analysed role already has a résumé. Analyse another one in <Link href="/applications">Opportunities</Link> to build a new draft.</>;

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
              /* The collapsed row shows the current version's score, never a draft edit. */
              const currentAts = scoreAts(draft.application.resume_draft ?? "", draft.analysis);
              return (
                <article className={`studio-draft${open ? " is-open" : ""}`} key={draft.application.id}>
                  <div className="studio-draft-row">
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
                    </button>

                    {/*
                      * Beside the score, where the eye already is after reading
                      * it — and outside the row button, because a button inside
                      * a button is invalid and the browser stops firing one.
                      */}
                    <button
                      type="button"
                      className="studio-expand"
                      title="Open the full-width editor"
                      aria-label={`Open the full-width editor for ${draft.application.resume_version ?? draft.jobTitle}`}
                      onClick={() => { setOpenId(draft.application.id); setExpandedId(draft.application.id); }}
                    >
                      <span aria-hidden="true">⤢</span>
                    </button>

                    <button
                      type="button"
                      className="studio-draft-chevron"
                      aria-label={open ? "Collapse this draft" : "Expand this draft"}
                      onClick={() => setOpenId(open ? null : draft.application.id)}
                    >
                      <span aria-hidden="true">{open ? "▲" : "▼"}</span>
                    </button>
                  </div>

                  {open ? renderWorkspace(draft) : null}
                </article>
              );
            })}
          </div>
        ) : (
          /*
           * The guidance lives here, where the absence is, rather than in a
           * card of its own further down the page.
           */
          <div className="empty-inline-state">
            {blockedReason ?? <>No résumés yet. Pick a role below to build your first draft.</>}
          </div>
        )}
      </section>

      {/*
        * Two ways to get a résumé, and they answer different questions.
        * "Build a new one" tailors to a role you are applying for; this takes
        * the CV you already have and makes it better. Neither invents.
        */}
      <section className="glass-card content-card" id="improve">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Improve a résumé you already have</h2>
            <p className="section-subtitle">
              Paste it or read it in from a file. Sartho scores it, names the lines carrying no measurable
              result, and rewrites those around a figure you supply — it will not invent one.
            </p>
          </div>
        </div>
        <ResumeWorkbench />
      </section>

      {/*
        * Only when there is something to build from.
        *
        * This was a permanent card, and most of the time its entire content was
        * a sentence saying the work is somewhere else: "Every analysed role
        * already has a résumé. Analyse another one in Opportunities." A card
        * that exists to tell you it has nothing for you is worse than no card —
        * it takes the space, the scroll and the attention of a real one.
        *
        * It is not a duplicate of the workbench above, which is why it is
        * hidden rather than deleted. The workbench improves a CV you already
        * wrote; this drafts a new one tailored to a specific advert from
        * approved evidence. Both are real, and neither can do the other's job.
        *
        * When there is nothing to build, the reason now appears once — in the
        * empty state of "Your résumés", where somebody is actually looking for
        * a résumé and not finding one.
        */}
      {canBuild ? (
        <section className="glass-card content-card" id="create">
          <div className="card-header">
            <div>
              <h2 className="section-heading">Build a new résumé</h2>
              <p className="section-subtitle">Pick a role whose requirements Sartho has already read. The draft uses only approved evidence.</p>
            </div>
          </div>

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
        </section>
      ) : null}

      {/*
        * The expanded editor. Same workspace, given the room a document needs:
        * the draft on the left at readable width, every suggestion on the right,
        * and nothing else on screen competing with it.
        */}
      {expanded ? (
        <div
          className="studio-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Editing ${expanded.application.resume_version ?? expanded.jobTitle}`}
          onClick={(event) => { if (event.target === event.currentTarget) setExpandedId(null); }}
        >
          <div className="studio-overlay-panel">
            <header className="studio-overlay-head">
              <div>
                <strong>{expanded.application.resume_version ?? expanded.jobTitle}</strong>
                <small>{expanded.employer ?? "Employer not recorded"}</small>
              </div>
              <button type="button" className="secondary-button" onClick={() => setExpandedId(null)}>
                Close <span aria-hidden="true">✕</span>
              </button>
            </header>
            <div className="studio-overlay-body">{renderWorkspace(expanded)}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
