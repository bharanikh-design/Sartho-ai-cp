"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { atsVerdict, scoreAts } from "@/lib/resume/ats";
import { unfilledBlanks } from "@/lib/resume/bullet-rewrite";
import { renderResumeText, resumeContentOf, type ResumeContent } from "@/lib/resume/content";
import { ResumeDocument, type BulletCoach } from "@/components/resume-document";
import { RESUME_TEMPLATES, resumeTemplate } from "@/lib/resume/templates";
import { ResumeWorkbench } from "@/components/resume-workbench";
import { ResumePdfRenderer } from "@/components/resume-pdf-templates";
import { LivePdfPreview } from "@/components/live-pdf-preview";
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  /* The draft being printed, so only that one is put on the page. */
  /*
   * Which draft, if any, is currently rendered into the print-only markup.
   *
   * The @media print rules hide `body *` and reveal only `.resume-print`, and
   * that element is only in the DOM while this is set. Nothing ever set it, so
   * the rules did fire on Ctrl+P and found nothing to reveal — the page printed
   * blank. It is cleared again as soon as the dialog closes so the hidden copy
   * is not left in the accessibility tree.
   */
  const [printingId, setPrintingId] = useState<string | null>(null);
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

  /*
   * Word, built on the server from the document on screen.
   *
   * The content is posted rather than read from the row, because what somebody
   * wants to download is what they are looking at — including edits they have
   * not saved. Downloading the saved version while the editor shows something
   * else is a mismatch nobody notices until after the file has been sent.
   */
  async function downloadDocx(draft: StudioDraft, content: ResumeContent) {
    if (downloadingId) return;
    setDownloadingId(draft.application.id);
    setError(null);
    try {
      const response = await fetch("/api/resume/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          versionName: draft.application.resume_version ?? draft.jobTitle,
          employer: draft.employer,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Sartho could not build the Word file.");
      }
      const blob = await response.blob();
      const name = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "Resume.docx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not build the Word file.");
    } finally {
      setDownloadingId(null);
    }
  }

  /*
   * PDF through the browser's own print dialog, on purpose.
   *
   * Every shortcut here rasterises the page — html2canvas and friends produce a
   * picture of a résumé, and a picture scores zero with every applicant tracking
   * system that opens it. Printing keeps the text as text, gets the person's own
   * paper size and margins, and costs no dependency. The print stylesheet puts
   * a clean read-only copy of the document on the page and hides everything
   * else, so what prints is the résumé and not the editor around it.
   */
  /*
   * A frame between committing the markup and opening the dialog. window.print
   * snapshots the document synchronously, so calling it in the same tick as the
   * state change prints the page as it was before React rendered the résumé.
   */
  useEffect(() => {
    if (!printingId) return;
    const frame = requestAnimationFrame(() => {
      window.print();
      setPrintingId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [printingId]);

  async function downloadPdf(draft: StudioDraft, content: ResumeContent) {
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(<ResumePdfRenderer content={content} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${content.name} - Resume.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate PDF", err);
      setError("Failed to generate PDF");
    }
  }

  async function generateMaster() {
    if (generatingId) return;
    setGeneratingId("master");
    setError(null);
    try {
      const response = await fetch('/api/resume/master', { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to draft master résumé.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to draft master résumé.");
    } finally {
      setGeneratingId(null);
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
  function renderWorkspace(draft: StudioDraft, isExpanded: boolean = false) {
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
    const verdict = atsVerdict(ats);
    const scoreTone = ats.score >= 70 ? "pass" : ats.score >= 40 ? "warn" : "fail";

    /*
     * How far the edits in front of you have moved the number. Sartho keeps
     * every version, so this is a real comparison against what is saved rather
     * than a guess — and it is the thing that makes editing feel like progress
     * instead of typing into a void.
     */
    const delta = ats.score - scoreAts(storedText, draft.analysis).score;

    /*
     * The ATS reader works on text and reports positions. renderResumeText
     * emits bullets in document order, so the nth bullet it counted is the nth
     * bullet here — which is what lets a flagged line be marked in the document
     * and opened from the rail.
     */
    const flatBullets = [
      ...content.roles.flatMap(r => r.bullets),
      ...content.sections.flatMap(s => s.bullets)
    ];
    const weak = ats.weakBullets
      .map((bullet) => ({ bullet: flatBullets[bullet.index], text: bullet.text }))
      .filter((entry): entry is { bullet: typeof flatBullets[number]; text: string } => Boolean(entry.bullet));
    const weakBulletIds = new Set(weak.map((entry) => entry.bullet.id));

    /*
     * The rewrite loop, handed to the document so the proposal opens under the
     * line it rewrites. The rail used to reprint every weak bullet in full,
     * which is a column of small text restating the page beside it — most of
     * why it read as noise rather than help.
     */
    const activeKey = openBullet && openBullet.startsWith(`${draft.application.id}:`) ? openBullet : null;
    const activeId = activeKey ? activeKey.slice(draft.application.id.length + 1) : null;
    const activeProposal = activeKey ? proposals[activeKey] : undefined;

    /* Accepting advances to the next line still missing a figure, so the loop keeps moving. */
    function acceptProposal(bulletId: string) {
      const accepted = (activeProposal ?? "").trim();
      if (!accepted) return;
      const next = {
        ...content,
        sections: content.sections.map((section) => ({
          ...section,
          bullets: section.bullets.map((entry) =>
            entry.id === bulletId ? { ...entry, text: accepted, edited: true } : entry,
          ),
        })),
      };
      setContent(next);
      const remaining = weak.filter((entry) => entry.bullet.id !== bulletId);
      const following = remaining[0];
      if (following) openBulletAt(draft, { id: following.bullet.id, text: following.bullet.text });
      else setOpenBullet(null);
    }

    const coach: BulletCoach = {
      activeId,
      proposal: activeProposal,
      questions: activeKey ? asked[activeKey] ?? [] : [],
      blanks: activeProposal ? unfilledBlanks(activeProposal) : [],
      error: activeKey ? proposalError[activeKey] ?? null : null,
      busy: busyBullet === activeKey,
      onOpen: (bulletId, bulletText) => openBulletAt(draft, { id: bulletId, text: bulletText }),
      onRetry: (bulletId, bulletText) => void propose(draft, { id: bulletId, text: bulletText }, true),
      onChange: (next) => { if (activeKey) setProposals((state) => ({ ...state, [activeKey]: next })); },
      onAccept: acceptProposal,
      onClose: () => setOpenBullet(null),
    };

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

        if (isExpanded) {
      return (
        <div className="studio-draft-body" style={{ gridTemplateColumns: '1fr 1fr', height: '80vh', overflow: 'hidden' }}>
          <div className="studio-draft-reader" style={{ overflowY: 'auto', paddingRight: '20px' }}>
            <div className="resume-draft-label">
              {isOlderVersion
                ? <>Version {chosen?.version_number} — an earlier draft, kept for comparison</>
                : dirty
                  ? <>Editing — not saved yet</>
                  : <>Draft — click any line to edit it</>}
            </div>

            <ResumeDocument
              content={content}
              onChange={setContent}
              weakBulletIds={weakBulletIds}
              coach={isOlderVersion ? undefined : coach}
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
              <button type="button" className="secondary-button" onClick={() => void downloadPdf(draft, content)}>
                Download PDF
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={downloadingId === draft.application.id}
                onClick={() => void downloadDocx(draft, content)}
              >
                {downloadingId === draft.application.id ? "Building…" : "Download Word"}
              </button>
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
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1e2420', borderRadius: '12px' }}>
            {!isOlderVersion ? (
              <div className="studio-templates" role="radiogroup" aria-label="Résumé template" style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--line)', margin: 0 }}>
                {RESUME_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={content.template === template.id}
                    className={content.template === template.id ? "is-selected" : ""}
                    title={`${template.description} ${template.bestFor}`}
                    onClick={() => setContent({ ...content, template: template.id })}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ flexGrow: 1, overflow: 'hidden' }}>
               <LivePdfPreview content={content} />
            </div>
          </div>
        </div>
      );
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

          {/*
            * Two templates, above the document rather than in a column of their
            * own — a third column would take width from the thing being read.
            *
            * Both are one column with real headings and real bullet lists, so
            * they parse identically; what changes is what a person sees. That
            * is said here rather than dressed up as an ATS advantage, because
            * the gallery of ten that every other builder sells is mostly
            * two-column layouts that get people filtered out.
            */}
          {!isOlderVersion && !isExpanded ? (
            <div className="studio-templates" role="radiogroup" aria-label="Résumé template">
              {RESUME_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  role="radio"
                  aria-checked={content.template === template.id}
                  className={content.template === template.id ? "is-selected" : ""}
                  title={`${template.description} ${template.bestFor}`}
                  onClick={() => setContent({ ...content, template: template.id })}
                >
                  {template.name}
                </button>
              ))}
              {/*
                * The chosen one described in full, under the row. A tooltip is
                * the wrong place for the only sentence that says who a
                * template is for: it needs a hover to find, and on a phone
                * there is no hover at all.
                */}
              <small>
                <strong>{resumeTemplate(content.template).description}</strong>{" "}
                {resumeTemplate(content.template).bestFor} All six are one column and parse the same.
              </small>
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
            coach={isOlderVersion ? undefined : coach}
            readOnly={isOlderVersion}
          />

          {/*
            * What actually goes on the paper.
            *
            * The same read-only render the version history uses, so the printed
            * file cannot drift from what the editor shows — and it is plain
            * headings and list items rather than the textareas on screen, which
            * print with borders, scrollbars and clipped text.
            */}
          {printingId === draft.application.id ? (
            <div className="resume-print" aria-hidden="true">
              <ResumeDocument content={content} onChange={() => {}} weakBulletIds={new Set()} readOnly />
            </div>
          ) : null}

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
            {/*
              * Two formats, because employers ask for two. Word is what an
              * applicant tracking system parses most reliably; PDF is what a
              * person opens without it reflowing on them.
              */}
            <button type="button" className="secondary-button" onClick={() => void downloadPdf(draft, content)}>
              Download PDF
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={downloadingId === draft.application.id}
              onClick={() => void downloadDocx(draft, content)}
            >
              {downloadingId === draft.application.id ? "Building…" : "Download Word"}
            </button>
            {/*
              * Printing is not the PDF download in another hat: it goes through
              * the print stylesheet, which is the only path that lays the
              * résumé out in points on a real page.
              */}
            <button
              type="button"
              className="secondary-button"
              disabled={printingId !== null}
              onClick={() => setPrintingId(draft.application.id)}
            >
              Print
            </button>
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
          {/*
            * The score, first and large.
            *
            * It was computed on every keystroke and shown nowhere — the only
            * number on the page was on the collapsed row outside the editor,
            * and that one was the *saved* score. So the panel could tell you
            * three things were wrong without ever telling you how wrong, and
            * editing gave no feedback at all.
            *
            * No "run the check" button: it already recalculates as you type,
            * and a button would only make a live number look stale.
            */}
          <div className={`studio-score is-${scoreTone}`}>
            <strong>{ats.score}</strong>
            <div>
              <b>{verdict.headline}</b>
              <small>
                {delta === 0
                  ? <>Unchanged since the saved version</>
                  : <>{delta > 0 ? "+" : ""}{delta} since the saved version</>}
              </small>
            </div>
          </div>

          {/* The single largest gain still available, as one thing to do. */}
          {verdict.lever ? <p className="studio-score-lever">{verdict.lever}</p> : null}

          {weak.length ? (
            <button
              type="button"
              className="studio-fix-start"
              onClick={() => {
                const first = weak[0];
                openBulletAt(draft, { id: first.bullet.id, text: first.bullet.text });
                document.getElementById(`bullet-${first.bullet.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Fix {weak.length} line{weak.length === 1 ? "" : "s"} with no figure →
            </button>
          ) : null}

          {/*
            * One line each, not a paragraph each. The detail is still there for
            * anyone who wants it, behind the row rather than in front of it.
            */}
          <ul className="studio-ats-checks">
            {/*
              * Every check here, inapplicable ones included: this draft is
              * aimed at a real advert, so "run the analysis" is an action the
              * person can take rather than noise.
              */}
            {ats.checks.map((check) => (
              <li key={check.label}>
                <details>
                  <summary>
                    <span style={{ color: stateTone[check.state] }} aria-hidden="true">
                      {check.state === "pass" ? "✓" : check.state === "warn" ? "!" : "×"}
                    </span>
                    {check.label}
                  </summary>
                  <small>{check.detail}</small>
                </details>
              </li>
            ))}
          </ul>

          {ats.unusedStrengths.length ? (
            <div className="studio-ats-missing">
              <strong>Strengths you can back, unused</strong>
              <div className="chip-row">
                {ats.unusedStrengths.slice(0, 8).map((term) => <span className="signal-chip" key={term}>{term}</span>)}
              </div>
            </div>
          ) : null}

          {/*
            * Stated, never suggested — these are things the role wants that the
            * evidence cannot back. The warning is now a phrase rather than the
            * two sentences it was: a rail is not the place for a paragraph.
            */}
          {ats.unbackedRequirements.length ? (
            <div className="studio-ats-unbacked">
              <strong>Wanted, but you cannot evidence it</strong>
              <div className="chip-row">
                {ats.unbackedRequirements.slice(0, 8).map((term) => <span className="signal-chip is-caution" key={term}>{term}</span>)}
              </div>
              <small>Do not add these. They are why this role is a stretch.</small>
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="secondary-button" onClick={generateMaster} disabled={generatingId === "master"} style={{ padding: "4px 8px", fontSize: "11px" }}>
              {generatingId === "master" ? "Building..." : "+ Master Résumé"}
            </button>
            <span className="meta-pill">{drafts.length} draft{drafts.length === 1 ? "" : "s"}</span>
          </div>
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
           *
           * blockedReason says which of four different situations this is —
           * no approved evidence, no saved roles, none analysed, or every
           * analysed role already drafted — and each one is a different next
           * step. It was computed and then never rendered, so an empty page
           * offered "Build Master Résumé" to somebody whose evidence was not
           * ready and whose click could only fail. The generic line is the
           * fallback for when nothing is actually blocked.
           */
          <div className="studio-empty">
            <h3>{blockedReason ? "Not yet — here is why" : "Ready to unlock the résumé templates?"}</h3>
            <p>
              {blockedReason ?? <>Sartho&apos;s templates, including the two-column ATS-safe designs, are built from your approved career evidence.</>}
            </p>
            <div className="studio-empty-actions">
              {/*
                * Offered only when it can succeed. A primary button that is
                * guaranteed to error is worse than no button.
                */}
              {canBuild ? (
                <button type="button" className="primary-button" onClick={generateMaster} disabled={generatingId === "master"}>
                  {generatingId === "master" ? "Building master résumé…" : "Build master résumé"}
                </button>
              ) : null}
              <Link href="/applications" className="secondary-button">
                Find a role in Opportunities
              </Link>
            </div>
            {error && generatingId === null ? <p className="inline-error" role="alert">{error}</p> : null}
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <button type="button" className="primary-button" onClick={() => void generate(role.id)} disabled={Boolean(generatingId)}>
                    {generatingId === role.id ? "Drafting…" : "Build résumé"}
                  </button>
                  {error && generatingId === null && <span style={{ color: 'red', fontSize: '12px', maxWidth: '300px', textAlign: 'right' }}>{error}</span>}
                </div>
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
          <div className="studio-overlay-panel" style={{ width: "95vw", maxWidth: "1600px" }}>
            <header className="studio-overlay-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{expanded.application.resume_version ?? expanded.jobTitle}</strong>
                <small>{expanded.employer ?? "Employer not recorded"}</small>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" className="primary-button" onClick={() => {
                  const stored = expanded.application.resume_content;
                  const text = expanded.application.resume_draft ?? "";
                  const c = documents[expanded.application.id] ?? resumeContentOf(stored, text);
                  if (c) void downloadPdf(expanded, c);
                }}>
                  Download PDF
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={downloadingId === expanded.application.id}
                  onClick={() => {
                    const stored = expanded.application.resume_content;
                    const text = expanded.application.resume_draft ?? "";
                    const c = documents[expanded.application.id] ?? resumeContentOf(stored, text);
                    if (c) void downloadDocx(expanded, c);
                  }}
                >
                  {downloadingId === expanded.application.id ? "Building…" : "Download Word"}
                </button>
                <button type="button" className="secondary-button" onClick={() => setExpandedId(null)}>
                  Close <span aria-hidden="true">✕</span>
                </button>
              </div>
            </header>
            <div className="studio-overlay-body" style={{ padding: '0 20px 20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{renderWorkspace(expanded, true)}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
