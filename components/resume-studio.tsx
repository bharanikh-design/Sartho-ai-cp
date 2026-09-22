"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { atsVerdict, scoreAts, tailoringGain } from "@/lib/resume/ats";
import { unfilledBlanks } from "@/lib/resume/bullet-rewrite";
import { overusedOpeners, reviewWriting } from "@/lib/resume/writing";
import { resumeVersionName } from "@/lib/resume/save";
import { suggestResumeFor, type PastResume } from "@/lib/resume/suggest";
import { renderResumeText, resumeContentOf, type ResumeContent } from "@/lib/resume/content";
import { ResumeDocument, type BulletCoach } from "@/components/resume-document";
import { RESUME_TEMPLATES, resumeTemplate, type ResumeTemplate } from "@/lib/resume/templates";
import { ResumeImport } from "@/components/resume-import";
import { ResumeUploads } from "@/components/resume-uploads";
import { AtsGatePanel } from "@/components/ats-gate-panel";
import type { ResumeImportRecord } from "@/lib/data/career";
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

/*
 * The master résumé's row id. Not a uuid, so it can never collide with an
 * application id, and one constant rather than the string "master" repeated —
 * the save path branches on it and a typo there would silently POST a master
 * résumé to a job that does not exist.
 */
const MASTER_ID = "master-resume";

/*
 * How many résumés before a grid is worth offering.
 *
 * Below this a list and a grid are the same rows in a different shape, and the
 * toggle is a control that changes nothing a person can feel. Six is roughly
 * where a page stops being scannable at a glance.
 */
const GRID_VIEW_THRESHOLD = 6;

const stateTone: Record<"pass" | "warn" | "fail", string> = {
  pass: "#6bcf93",
  warn: "#e0b061",
  fail: "#e5917a",
};

/*
 * The document toolbar's icons.
 *
 * Text buttons wrapped onto two rows and spent the width of the document on
 * words their shapes already carry. Each button keeps the words in its
 * accessible name and its tooltip, so nothing is lost to a screen reader or to
 * somebody meeting the row for the first time.
 *
 * Print and Regenerate are gone from the row. Print made a PDF through the
 * browser dialog beside a button that makes a PDF; Regenerate did what the
 * "write it for me" bar above the document does, and for the master it
 * called a job route with no job. Two controls for one action is one too many.
 */
const toolIcon = {
  width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
};

function ToolIcon({ name }: { name: "save" | "pdf" | "word" | "copy" | "discard" }) {
  switch (name) {
    case "save":
      return <svg {...toolIcon}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></svg>;
    case "pdf":
      return <svg {...toolIcon}><path d="M12 3v11" /><path d="m8 10.5 4 3.5 4-3.5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>;
    case "word":
      return <svg {...toolIcon}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>;
    case "copy":
      return <svg {...toolIcon}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
    case "discard":
      return <svg {...toolIcon}><path d="M3 12a9 9 0 1 0 3.2-6.9" /><path d="M3 4v5h5" /></svg>;
  }
}

/*
 * One template, with its colour and its cost.
 *
 * The picker was eight identical text buttons, which is a list of words for a
 * choice that is entirely visual — somebody had to select one and look at the
 * preview to learn anything. The accent swatch is the fastest true thing that
 * can be said about a template at this size.
 *
 * The ATS note is the part no competitor shows. A sidebar template is not
 * hidden or discouraged: the Word file beside it is single column whatever is
 * chosen here, so the only thing at stake is which of the two files to attach
 * where — and that is said at the moment of choosing rather than discovered
 * afterwards.
 */
/*
 * The wand.
 *
 * An emoji sparkle is what every product uses and it renders differently on
 * every platform — on some it is a flat grey asterisk, which is a poor mark for
 * the most capable thing on the page. This is drawn, so it looks the same
 * everywhere and can move: the sparks drift while the wand is working, and sit
 * still when it is not.
 */
function MagicWand() {
  return (
    <svg className="studio-wand" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20 14.5 9.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M16.8 3.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"
        fill="currentColor"
        className="studio-wand-spark studio-wand-spark-one"
      />
      <path
        d="M20.4 10.1l.45 1.25 1.25.45-1.25.45-.45 1.25-.45-1.25-1.25-.45 1.25-.45.45-1.25Z"
        fill="currentColor"
        className="studio-wand-spark studio-wand-spark-two"
      />
      <path
        d="M11.6 3.2l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1Z"
        fill="currentColor"
        className="studio-wand-spark studio-wand-spark-three"
      />
    </svg>
  );
}

function TemplateChip({
  template,
  selected,
  onSelect,
}: {
  template: ResumeTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`studio-template-chip${selected ? " is-selected" : ""}`}
      title={`${template.description} ${template.bestFor}`}
      onClick={onSelect}
    >
      <span className="studio-template-swatch" style={{ background: template.pdf.accent }} aria-hidden="true">
        {template.pdf.layout === "sidebar" ? <i /> : null}
      </span>
      <span className="studio-template-name">{template.name}</span>
      {!template.atsSafe ? <span className="studio-template-flag" title="Send the Word file to an applicant tracking system">Designed</span> : null}
    </button>
  );
}

export function ResumeStudio({
  drafts,
  tailorable,
  hasAnyJobs,
  analysedCount,
  evidenceReady,
  masterResumeText,
  master,
  masterUpdatedAt,
  driveConnected,
  uploads,
}: {
  drafts: StudioDraft[];
  /** Roles whose analysis is finished, so a truthful draft can be built. */
  tailorable: TailorableRole[];
  hasAnyJobs: boolean;
  /** Roles that have been analysed at all, drafted or not. */
  analysedCount: number;
  /** Whether any approved, résumé-safe career fact exists to write from. */
  evidenceReady: boolean;
  /**
   * The master résumé as text, when one has been built.
   *
   * Here so the studio can answer the question the panel never could: not
   * "how does this draft read", which it has always shown, but "was tailoring
   * to this advert worth anything". Both documents are scored against the
   * same role analysis, so the difference is like-for-like.
   */
  masterResumeText: string | null;
  /**
   * The master résumé as a document, so it can be read rather than only scored
   * against. Null until one has been built.
   */
  master: ResumeContent | null;
  /** When it was last built, so "is this current?" has an answer on the page. */
  masterUpdatedAt: string | null;
  /** Decided on the server, so the Drive picker does not flash a prompt. */
  driveConnected: boolean;
  /**
   * Every résumé this person has uploaded, newest first, so an upload is
   * visible on the page it was made from — with the flag that says which one
   * is the master.
   */
  uploads: ResumeImportRecord[];
}) {
  const router = useRouter();
  /*
   * Nothing open on arrival.
   *
   * The first draft expanded itself, so the page opened as one document with a
   * list hidden under it — and after the master card was added it opened as two
   * documents. A repository's job is to show you what you have; you open the
   * one you came for.
   */
  const [openId, setOpenId] = useState<string | null>(null);
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

  /*
   * Whether the next upload is flagged as the master. Off by default: moving
   * the flag off the document every other one starts from is not a thing to
   * do by accident. The flag is the only thing it does — the upload is kept
   * exactly as it was given, and nothing is rewritten from it.
   */
  const [makeMaster, setMakeMaster] = useState(false);

  /*
   * List or grid.
   *
   * A list is the better default: it is scannable, it fits the score and the
   * subtitle on one line, and a résumé is chosen by what it was written for
   * rather than by how it looks. The grid is for somebody with a dozen of them
   * who is looking for one by shape.
   *
   * Expanding in place only makes sense in the list — a row opening inside a
   * grid cell would push every tile after it down the page — so the grid opens
   * straight into the full-window editor instead.
   */
  const [view, setView] = useState<"list" | "grid">("list");

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
  /*
   * The expanded editor. The inline panel is a squeezed two-column strip; a
   * résumé is a document and wants the width. Same workspace either way — the
   * body is rendered once and placed in whichever container is showing.
   */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

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
      /*
       * The master has no job, so it cannot use the job-scoped rewrite route.
       *
       * Every "Strengthen this line" and "Improve summary with AI" button on
       * the master row was fetching /api/jobs/master-resume/resume/improve —
       * an id that is not a uuid, against a route that rejects one, so every
       * click 404'd silently. /api/resume/improve is the job-less twin written
       * for exactly this, and it was orphaned the moment its only other caller
       * was removed.
       */
      const isMaster = draft.jobId === MASTER_ID;
      const response = await fetch(isMaster ? "/api/resume/improve" : `/api/jobs/${draft.jobId}/resume/improve`, {
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
      /*
       * The master saves over itself; a tailored draft saves a new version.
       * That is the one genuine difference between them — a master résumé has
       * no advert to have been version two for.
       */
      const isMaster = draft.jobId === MASTER_ID;
      const response = await fetch(isMaster ? "/api/resume/master" : `/api/jobs/${draft.jobId}/resume/version`, {
        method: isMaster ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        /*
         * Named on the way in, by the role and the moment.
         *
         * The route defaults to the previous version's name when none is
         * given, so every save inherited one and the repository filled with
         * rows that all said "Tailored résumé". The client is the side that
         * knows which role this is.
         */
        body: isMaster
          ? JSON.stringify({ content })
          : JSON.stringify({ content, changes, versionName: resumeVersionName(draft.jobTitle) }),
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
      setOpenId(MASTER_ID);
      requestAnimationFrame(() => {
        document.getElementById("drafts")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to draft master résumé.");
    } finally {
      setGeneratingId(null);
    }
  }

  /*
   * The master upload, opened in the editor.
   *
   * Free when the editor already holds a document laid out from this file.
   * Otherwise the file is laid out first — copied, never rewritten — and saved
   * as the master, which replaces whatever the master was; that is said before
   * it happens, because edits to the old one do not survive it.
   */
  async function openUploadInStudio(item: ResumeImportRecord, alreadyBuilt: boolean) {
    const show = () => {
      setOpenId(MASTER_ID);
      setExpandedId(MASTER_ID);
    };
    if (alreadyBuilt) { show(); return; }
    if (master && !window.confirm(`Open ${item.file_name} in Studio as your master résumé? The master currently in Studio, and any edits to it, will be replaced.`)) return;
    if (generatingId) return;
    setGeneratingId("master");
    setError(null);
    try {
      const response = await fetch("/api/resume/master/from-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: item.id }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not open that résumé in Studio.");
      router.refresh();
      show();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not open that résumé in Studio.");
    } finally {
      setGeneratingId(null);
    }
  }

  /*
   * The whole document, written again from approved evidence.
   *
   * The master and a tailored draft use the two routes that already exist for
   * it — the same ones behind "+ Master Résumé" and "Build résumé". Nothing
   * new is generated here; it is the same capability, reachable from where
   * somebody is working rather than only from a card header.
   */
  async function rewriteWholeDocument(draft: StudioDraft) {
    if (draft.jobId === MASTER_ID) return generateMaster();
    return generate(draft.jobId);
  }

  async function generate(jobId: string) {
    if (generatingId) return;
    setGeneratingId(jobId);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume`, { method: "POST" });
      const result = await response.json() as { error?: string; applicationId?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to draft the résumé.");
      router.refresh();
      /*
       * Open what was just built, in "Your résumés" where it now lives.
       *
       * Building used to refresh the page and leave the new draft collapsed in
       * a list further down — so the answer to "Build résumé" was a spinner
       * stopping, and the person had to go and find the thing they had asked
       * for. The id comes back from the route so the right row opens even when
       * several drafts arrive close together.
       */
      if (result.applicationId) {
        setOpenId(result.applicationId);
        requestAnimationFrame(() => {
          document.getElementById("drafts")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to draft the résumé.");
    } finally {
      setGeneratingId(null);
    }
  }

  /* The editor is a real modal: trap focus, Escape to close, then restore focus. */
  useEffect(() => {
    if (!expandedId) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = overlayRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? []);
    requestAnimationFrame(() => (focusable()[0] ?? panel)?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setExpandedId(null); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panel?.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
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
    /* The document and the advert's title go in too, so placement and the title line are judged. */
    const scoring = { content, jobTitle: draft.jobId === MASTER_ID ? null : draft.jobTitle };
    const ats = scoreAts(text, draft.analysis, scoring);
    const verdict = atsVerdict(ats);
    const scoreTone = ats.score >= 70 ? "pass" : ats.score >= 40 ? "warn" : "fail";

    /*
     * How far the edits in front of you have moved the number. Sartho keeps
     * every version, so this is a real comparison against what is saved rather
     * than a guess — and it is the thing that makes editing feel like progress
     * instead of typing into a void.
     */
    const delta = ats.score - scoreAts(storedText, draft.analysis, { ...scoring, content: saved }).score;

    /*
     * What tailoring to this advert was worth.
     *
     * The master résumé scored against this role's own requirement vocabulary,
     * beside the draft written for it. This is the one comparison the panel
     * could never make: it has always shown how the document in front of you
     * reads, and never whether aiming it at this advert changed anything.
     *
     * Null when there is no master, and that is said rather than shown as a
     * rise from zero — an absent comparison is not a score of nothing.
     */
    const { before: masterScore, gain: tailorGain } = tailoringGain(masterResumeText, text, draft.analysis);

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
     * What is wrong with each line, beyond whether it carries a number.
     *
     * The panel could only ever say "this line has no figure", which is one
     * rule out of ten and the least interesting of them — and it is why the
     * coaching read as a machine asking for percentages. A weak opener, the
     * passive voice, a claim no reader can check, a pronoun, a bullet that has
     * become a paragraph: these are what a person would actually fix, and the
     * house standard has been able to find them since it was written.
     *
     * Free, instant and deterministic. No model, no call, no waiting — the
     * rules are the same ones the drafting routes are given, so the page can
     * only ever flag something Sartho itself asked for.
     */
    const findings = reviewWriting(flatBullets.map((bullet) => bullet.text))
      .map((finding) => ({ ...finding, bullet: flatBullets[finding.index] }))
      .filter((finding) => Boolean(finding.bullet));

    /*
     * Repetition is judged per role, not across the document. Two bullets in
     * one job opening on "Led" reads as a theme; six across a career reads as
     * a vocabulary of one, and the roles are where a reader notices it.
     */
    const repeated = content.roles.flatMap((role) =>
      overusedOpeners(role.bullets.map((bullet) => bullet.text), 2)
        .map((entry) => ({ role: role.title || role.employer || "this role", ...entry })),
    );

    /*
     * The mark on the document, and the reason beside it.
     *
     * Both sets of findings put the same mark on a line — a reader does not
     * care which check caught it — but the note says which, because "it states
     * no result" was being shown on lines whose problem was the passive voice.
     */
    const bulletNotes = new Map<string, string>();
    for (const finding of findings) {
      if (!bulletNotes.has(finding.bullet.id)) bulletNotes.set(finding.bullet.id, `✨ ${finding.detail}`);
    }
    const markedBulletIds = new Set([...weakBulletIds, ...findings.map((finding) => finding.bullet.id)]);

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
            {/*
              * Let AI write it, where somebody is already looking.
              *
              * The AI that writes a whole résumé has existed since the product
              * did — it is what "Build résumé" and "+ Master Résumé" call. But
              * both of those live in a card header, outside the editor, so the
              * only AI visible while actually working on a document was the
              * per-line coach and the summary rewrite. Somebody inside the
              * editor had no way to ask for the whole thing, and reasonably
              * concluded there wasn't one.
              *
              * Same routes, put where the work happens.
              */}
            {/*
              * The score, in the full-window editor too.
              *
              * The rail that carries it belongs to the inline layout, and the
              * full window had the preview where the rail would go — so the
              * one editor with the most room was the one that never said how
              * the document reads. The same live number, above the page.
              */}
            <div className={`studio-score is-${scoreTone}`} style={{ marginBottom: 12 }}>
              <strong>{ats.score}</strong>
              <div>
                <b>{verdict.headline}</b>
                <small>
                  {delta === 0
                    ? <>ATS readability · unchanged since the saved version</>
                    : <>ATS readability · {delta > 0 ? "+" : ""}{delta} since the saved version</>}
                </small>
              </div>
            </div>
            <AtsGatePanel content={content} checkKey={`${documentKey}:${content.template}:${storedText.length}`} compact />
            <div className="studio-ai-bar">
              <button
                type="button"
                className={`studio-ai-write${generatingId === draft.application.id || generatingId === "master" ? " is-working" : ""}`}
                disabled={Boolean(generatingId)}
                onClick={() => void rewriteWholeDocument(draft)}
              >
                <MagicWand />
                <span>
                  {generatingId === draft.application.id || generatingId === "master"
                    ? "Writing your résumé…"
                    : "Write it for me"}
                </span>
              </button>
              <small>
                Rewrites every line from the career facts you approved. Your current version is kept.
              </small>
            </div>


            <ResumeDocument
              content={content}
              onChange={setContent}
              weakBulletIds={markedBulletIds}
              bulletNotes={bulletNotes}
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
              <span className="resume-doc-tools">
                <button type="button" title="Download PDF" aria-label="Download PDF" onClick={() => void downloadPdf(draft, content)}>
                  <ToolIcon name="pdf" />
                </button>
                <button
                  type="button"
                  title="Download Word"
                  aria-label="Download Word"
                  disabled={downloadingId === draft.application.id}
                  onClick={() => void downloadDocx(draft, content)}
                >
                  <ToolIcon name="word" />
                </button>
                <button
                  type="button"
                  title={copiedId === draft.application.id ? "Copied" : "Copy draft"}
                  aria-label={copiedId === draft.application.id ? "Copied" : "Copy draft"}
                  onClick={() => void copy(text, draft.application.id)}
                >
                  <ToolIcon name="copy" />
                </button>
              </span>
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
                  <TemplateChip
                    key={template.id}
                    template={template}
                    selected={content.template === template.id}
                    onSelect={() => setContent({ ...content, template: template.id })}
                  />
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
                const versionContent = resumeContentOf(version.content, version.draft);\n                const versionAts = scoreAts(version.draft, draft.analysis, { content: versionContent, jobTitle: draft.jobId === MASTER_ID ? null : draft.jobTitle });
                return (
                  <button
                    type="button"
                    key={version.id}
                    className={`studio-version${isShown ? " is-shown" : ""}`}
                    aria-pressed={isShown}
                    title={version.version_name ?? `Version ${version.version_number}`}
                    onClick={() => setViewing((state) => ({ ...state, [draft.application.id]: version.id }))}
                  >
                    <strong>v{version.version_number}</strong>
                    <small>{versionAts.score} ATS</small>
                    {/*
                      * The time as well as the day. Two saves on one afternoon
                      * showed the same "12 Sep" and were indistinguishable,
                      * which is the whole thing a version list is for.
                      */}
                    <small>{new Date(version.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</small>
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
                <TemplateChip
                  key={template.id}
                  template={template}
                  selected={content.template === template.id}
                  onSelect={() => setContent({ ...content, template: template.id })}
                />
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
            * Let AI write it, where somebody is already looking.
            *
            * The AI that writes a whole résumé has existed since the product
            * did — it is what "Build résumé" and "+ Master Résumé" call. But
            * both of those live in a card header, outside the editor, so the
            * only AI visible while actually working on a document was the
            * per-line coach and the summary rewrite. Somebody inside the
            * editor had no way to ask for the whole thing, and reasonably
            * concluded there wasn't one.
            *
            * Same routes, put where the work happens.
            */}
          <div className="studio-ai-bar">
            <button
              type="button"
              className="studio-ai-write"
              disabled={Boolean(generatingId)}
              onClick={() => void rewriteWholeDocument(draft)}
            >
              ✨ {generatingId === draft.application.id || generatingId === "master"
                ? "Writing…"
                : "Let AI write it from your evidence"}
            </button>
            <small>
              Rewrites every line from the career facts you approved. Your current version is kept.
            </small>
          </div>


          {/*
            * An older version is history and stays readable rather than
            * editable: editing one would make the record of what you sent
            * somewhere a worse record than no record at all.
            */}
          <ResumeDocument
            content={content}
            onChange={setContent}
            weakBulletIds={markedBulletIds}
            bulletNotes={bulletNotes}
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
            <span className="resume-doc-tools">
              {/*
                * Saving leads the row, and is shown whether or not there are
                * edits — a control that vanishes when there is nothing to do
                * cannot tell you that there is nothing to do. Disabled with a
                * tooltip says "this version is already in your library"; absent
                * says nothing at all.
                */}
              <button
                type="button"
                className={dirty ? "is-primary" : ""}
                title={dirty ? `Save as a new version of ${draft.jobTitle}` : "Saved — no unsaved edits"}
                aria-label={dirty ? `Save as a new version of ${draft.jobTitle}` : "Saved. No unsaved edits."}
                disabled={!dirty || savingId === draft.application.id}
                onClick={() => void saveVersion(draft, documentKey, content, changesFor(content))}
              >
                <ToolIcon name="save" />
              </button>
              <span className="resume-doc-tools-split" aria-hidden="true" />
              <button type="button" title="Download PDF" aria-label="Download PDF" onClick={() => void downloadPdf(draft, content)}>
                <ToolIcon name="pdf" />
              </button>
              <button
                type="button"
                title="Download Word"
                aria-label={downloadingId === draft.application.id ? "Building Word document" : "Download Word"}
                disabled={downloadingId === draft.application.id}
                onClick={() => void downloadDocx(draft, content)}
              >
                <ToolIcon name="word" />
              </button>
              <button
                type="button"
                title={copiedId === draft.application.id ? "Copied" : "Copy draft"}
                aria-label={copiedId === draft.application.id ? "Copied" : "Copy draft"}
                onClick={() => void copy(text, draft.application.id)}
              >
                <ToolIcon name="copy" />
              </button>
              {dirty ? (
                <button
                  type="button"
                  title="Discard edits"
                  aria-label="Discard edits"
                  onClick={() => setDocuments((state) => { const next = { ...state }; delete next[documentKey]; return next; })}
                >
                  <ToolIcon name="discard" />
                </button>
              ) : null}
            </span>
            {dirty ? <small className="studio-regenerate-note">Your edits are not saved until you save them.</small> : null}
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

          {/*
            * What aiming this at the advert bought, against the same advert.
            *
            * Shown only when it is a real comparison — a master exists and the
            * role has been analysed. Without an analysis both numbers come
            * from the same handful of format checks and the difference would
            * be noise dressed as a finding.
            */}
          {/*
            * Before the score, apart from it: whether the document gets read
            * at all. A blended number hides the one fault that loses an
            * interview outright, so the gate is its own verdict.
            */}
          <AtsGatePanel content={content} checkKey={`${documentKey}:${content.template}:${storedText.length}`} />

          {tailorGain !== null && draft.analysis && draft.jobId !== MASTER_ID ? (
            <p className={`studio-tailor-gain is-${tailorGain > 0 ? "up" : tailorGain < 0 ? "down" : "flat"}`}>
              {tailorGain > 0
                ? <>Tailoring to this role is worth <b>+{tailorGain}</b> over your master résumé, which scores {masterScore} here.</>
                : tailorGain < 0
                  ? <>This draft reads <b>{tailorGain}</b> against your master résumé, which scores {masterScore} here. Your master may be the better document to send.</>
                  : <>This draft and your master résumé read the same to this role, both {masterScore}.</>}
            </p>
          ) : null}

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
            * Named faults, one line each, each opening the bullet it is about.
            *
            * Listed rather than counted: "3 lines need work" is a number, and
            * "opens on 'helped', which reports being near the work" is
            * something a person can act on in the next ten seconds. Capped at
            * six, because a rail listing every fault on a long résumé is the
            * wall of grey text this panel was rewritten to stop being.
            */}
          {findings.length ? (
            <div className="studio-writing-findings">
              <strong>{findings.length} line{findings.length === 1 ? "" : "s"} worth rewording</strong>
              <ul>
                {findings.slice(0, 6).map((finding) => (
                  <li key={`${finding.bullet.id}-${finding.kind}`}>
                    <button
                      type="button"
                      onClick={() => {
                        openBulletAt(draft, { id: finding.bullet.id, text: finding.bullet.text });
                        document.getElementById(`bullet-${finding.bullet.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      {finding.detail}
                    </button>
                  </li>
                ))}
              </ul>
              {findings.length > 6 ? <small>and {findings.length - 6} more</small> : null}
            </div>
          ) : null}

          {/* A page that opens six bullets on the same verb reads as a form. */}
          {repeated.length ? (
            <p className="studio-writing-repeat">
              {repeated.slice(0, 2).map((entry) => `${entry.count} bullets under ${entry.role} open on "${entry.verb}"`).join("; ")}.
              {" "}Vary the verb to fit the work.
            </p>
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
                    {/* A check that cannot apply yet is neither passed nor failed; a cross on it reads as a fault. */}
                    <span style={{ color: check.applicable ? stateTone[check.state] : "var(--text-tertiary)" }} aria-hidden="true">
                      {!check.applicable ? "–" : check.state === "pass" ? "✓" : check.state === "warn" ? "!" : "×"}
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


  /* Whether there is a role a truthful draft could be written for right now. */
  /*
   * The résumés this person already has, in the shape the suggester wants.
   * Read off the drafts the page was given rather than fetched again: they are
   * the same rows, and a second query for data already in props is a round
   * trip nobody is waiting for.
   */
  const pastResumes: PastResume[] = drafts.map((draft) => ({
    applicationId: draft.application.id,
    jobTitle: draft.jobTitle,
    employer: draft.employer,
    updatedAt: draft.application.updated_at ?? "",
  }));

  /*
   * The master résumé as a row in the list, not a card above it.
   *
   * It had a section of its own, permanently expanded, read-only, sitting on
   * top of the drafts — so the page said "here is a document you cannot edit"
   * before it said "here are your résumés", and the master obeyed different
   * rules from everything below it.
   *
   * It is a résumé. It belongs in the list of résumés, opening in the same
   * window, with the same template picker, the same editor and the same
   * actions. The synthetic application row is what lets renderWorkspace treat
   * it identically rather than growing a second code path — and a second code
   * path is exactly how the two drifted apart in the first place.
   */
  /* The file the master was laid out from, when it was one. */
  const masterSource = master?.sourceImportId ? uploads.find((item) => item.id === master.sourceImportId) ?? null : null;

  const masterDraft: StudioDraft | null = master
    ? {
        application: {
          id: MASTER_ID,
          user_id: "",
          job_id: MASTER_ID,
          status: "saved",
          resume_version: "Master résumé",
          resume_draft: masterResumeText,
          resume_content: master,
          resume_change_log: [],
          resume_evidence_ids: [],
          resume_generated_at: masterUpdatedAt,
          outcome_stage: null,
          outcome_reason: null,
          outcome_note: null,
          outcome_recorded_at: null,
          cover_note: null,
          submitted_at: null,
          confirmation_reference: null,
          next_action: null,
          next_action_date: null,
          created_at: masterUpdatedAt ?? "",
          updated_at: masterUpdatedAt ?? "",
        } as ApplicationRecord,
        jobId: MASTER_ID,
        jobTitle: "Master résumé",
        employer: null,
        /* No advert, so no requirement vocabulary to score against. */
        analysis: null,
        history: [],
      }
    : null;

  /* One list. The master first, because every tailored version comes off it. */
  const allDrafts: StudioDraft[] = masterDraft ? [masterDraft, ...drafts] : drafts;

  /*
   * The grid only applies where it is offered. Somebody who chose it with a
   * dozen résumés and then deleted ten should not be left in a two-tile grid
   * with no control to leave it.
   */
  const showGrid = view === "grid" && allDrafts.length >= GRID_VIEW_THRESHOLD;

  /*
   * Looked up in the full list, master included.
   *
   * It searched `drafts`, which is the tailored ones only — so expanding the
   * master row found nothing, the overlay never rendered, and the button did
   * nothing at all. The master became a row in that list and this was left
   * pointing at the old one.
   */
  const expanded = allDrafts.find((draft) => draft.application.id === expandedId) ?? null;

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
      ? <>Nothing to write from yet. Upload your résumé below, flag it as your master and open it in Studio.</>
      : !hasAnyJobs
        ? <>Save a role in <Link href="/applications">Opportunities</Link> first — a résumé is tailored to one real advert, not written in the abstract.</>
        : analysedCount === 0
          ? <>None of your saved roles have been analysed yet. Run the analysis on one in <Link href="/applications">Opportunities</Link>, then come back.</>
          : <>Every analysed role already has a résumé. Analyse another one in <Link href="/applications">Opportunities</Link> to build a new draft.</>;

  return (
    <>
      {generatingId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)", animation: "fadeIn 0.3s ease-out" }}>
          <div style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px", padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", maxWidth: "400px", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
            <MagicWand />
            <h3 style={{ margin: 0, color: "#fff", fontSize: "1.2rem" }}>Crafting your résumé</h3>
            <p style={{ margin: 0, color: "#b9d1c6", fontSize: "0.95rem", lineHeight: 1.5 }}>
              Sartho is analyzing the role and your career history to craft a tailored résumé. This takes a few seconds...
            </p>
          </div>
        </div>
      )}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <section className="glass-card content-card" id="drafts">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Your résumés</h2>
            <p className="section-subtitle">
              Your master and every version written for a role, newest work first. Open one to edit it — they all open the same way.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/*
              * Offered only once there is enough to look at.
              *
              * A list and a grid of three rows are the same three rows, so the
              * toggle was two buttons that changed nothing anybody could feel —
              * chrome asking to be understood in exchange for nothing. A grid
              * starts earning its place when scanning becomes hunting.
              */}
            {allDrafts.length >= GRID_VIEW_THRESHOLD ? (
            <div className="studio-view-toggle" role="group" aria-label="How to show your résumés">
              <button
                type="button"
                className={view === "list" ? "is-selected" : ""}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                title="List"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <button
                type="button"
                className={view === "grid" ? "is-selected" : ""}
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                title="Grid"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
                  <rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
                </svg>
              </button>
            </div>
            ) : null}
            <span className="meta-pill">{allDrafts.length} résumé{allDrafts.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {allDrafts.length ? (
          <div className={showGrid ? "studio-draft-grid" : "studio-draft-list"}>
            {allDrafts.map((draft) => {
              const open = openId === draft.application.id;
              /* The collapsed row shows the current version's score, never a draft edit. */
              const currentText = draft.application.resume_draft ?? "";\n              const currentContent = resumeContentOf(draft.application.resume_content, currentText);\n              const currentAts = scoreAts(currentText, draft.analysis, { content: currentContent, jobTitle: draft.jobId === MASTER_ID ? null : draft.jobTitle });
              return (
                <article className={`studio-draft${open ? " is-open" : ""}`} key={draft.application.id}>
                  <div className="studio-draft-row">
                    <button
                      type="button"
                      className="studio-draft-head"
                      /*
                       * In the grid a row cannot expand in place — it would push
                       * every tile after it down the page — so it opens the
                       * full-window editor, which is where that much document
                       * belongs anyway.
                       */
                      onClick={() => {
                        if (showGrid) { setOpenId(draft.application.id); setExpandedId(draft.application.id); return; }
                        setOpenId(open ? null : draft.application.id);
                      }}
                      aria-expanded={showGrid ? undefined : open}
                    >
                      <span className="studio-draft-name">
                        <strong>
                          {draft.application.resume_version ?? draft.jobTitle}
                          {draft.jobId === MASTER_ID ? <em className="studio-draft-badge">Master</em> : null}
                        </strong>
                        {/*
                          * What each row is, in its own terms. A master résumé
                          * has no employer and no change log, so printing
                          * "Employer not recorded · 0 changes logged" under it
                          * was three facts about a document of a different kind.
                          */}
                        <small>
                          {draft.jobId === MASTER_ID ? (
                            masterSource
                              ? <>Laid out from {masterSource.file_name} · every tailored version starts here</>
                              : <>Everything you can evidence · every tailored version starts here</>
                          ) : (
                            <>
                              {draft.employer ?? "Employer not recorded"}
                              {draft.history.length > 1 ? <> · {draft.history.length} versions</> : null}
                              {" · "}{draft.application.resume_change_log.length} changes logged
                            </>
                          )}
                        </small>
                      </span>
                      <span className="studio-ats-badge" style={{ color: stateTone[currentAts.score >= 70 ? "pass" : currentAts.score >= 40 ? "warn" : "fail"] }}>
                        {currentAts.score}<small>ATS</small>
                      </span>
                      {/* The same control the row already is, drawn rather than duplicated as a second button. */}
                      {showGrid ? null : <span className="studio-draft-caret" aria-hidden="true">{open ? "▲" : "▼"}</span>}
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

                  </div>

                  {open && !showGrid ? renderWorkspace(draft) : null}
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
              {evidenceReady ? (
                <Link href="/applications" className="secondary-button">
                  Find a role in Opportunities
                </Link>
              ) : (
                <a href="#uploads" className="secondary-button">Upload your résumé</a>
              )}
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
      <section className="glass-card content-card" id="add">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Add a résumé</h2>
            <p className="section-subtitle">
              PDF, Word or plain text. Sartho reads it into the career facts everything else is built from,
              and keeps the file and its full text exactly as you uploaded them.
            </p>
          </div>
          {uploads.length ? <span className="meta-pill">{uploads.length} uploaded</span> : null}
        </div>

        {/*
          * An upload, not a paste box.
          *
          * This was "Improve a résumé you already have": a textarea, a "read
          * from a file" button, and a separate scoring and rewriting loop that
          * did not touch anything else in the product. So a résumé improved
          * there existed nowhere afterwards — not in the list, not as a master,
          * not as evidence. It was a second résumé tool living inside the first
          * one, with its own idea of what a résumé is.
          *
          * The same import that runs on Career Truth runs here, because there
          * should be exactly one way a document gets into Sartho. What is added
          * is the checkbox: whether this one also becomes the master.
          */}
        <label className="studio-master-flag">
          <input
            type="checkbox"
            checked={makeMaster}
            onChange={(event) => setMakeMaster(event.target.checked)}
          />
          <span>
            <strong>Make this my master résumé</strong>
            <small>
              Flags this upload as the master. It is kept word for word as you gave it — nothing is rewritten or shortened.
              You can move the flag to another upload at any time below.
            </small>
          </span>
        </label>

        <ResumeImport
          hasEvidence
          showLead={false}
          driveConnected={driveConnected}
          makeMaster={makeMaster}
        />

        {/*
          * The uploads themselves, where the upload happened.
          *
          * Until now this page showed only the documents Sartho had written,
          * and the file somebody uploaded was deleted the moment it was read.
          * So the answer to "where is the résumé I just gave you" was a list
          * on another page with the document itself missing from it.
          */}
        <div className="studio-uploads" id="uploads">
          <h3 className="section-heading" style={{ fontSize: "var(--text-sm)", margin: "18px 0 8px" }}>Uploaded résumés</h3>
          <ResumeUploads imports={uploads} studioSourceId={master?.sourceImportId ?? null} onOpenInStudio={openUploadInStudio} />
        </div>
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
            {tailorable.map((role) => {
              /*
               * The résumé already written for the most similar role.
               *
               * Every draft is built from scratch, which is right the first
               * time and wasteful the fifth: somebody who has already tailored
               * for a ServiceNow delivery role has chosen which evidence
               * leads, which wording survived and which lines they edited by
               * hand. Starting the next one blank throws that away and asks
               * them to decide it all again.
               *
               * Offered beside the build button rather than instead of it. A
               * suggestion read off two job titles is sometimes wrong, and the
               * cost of being wrong must never be a résumé somebody did not
               * choose.
               */
              const suggestion = suggestResumeFor(role.title, pastResumes);
              return (
              <article key={role.id}>
                <div>
                  <strong>{role.title}</strong>
                  <small>{role.employer ?? "Employer not recorded"}</small>
                  {suggestion ? (
                    <small className="studio-resume-suggestion">
                      {suggestion.reason}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(suggestion.resume.applicationId);
                          requestAnimationFrame(() => {
                            document.getElementById("drafts")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }}
                      >
                        Open it
                      </button>
                    </small>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <button type="button" className="primary-button" onClick={() => void generate(role.id)} disabled={Boolean(generatingId)}>
                    {generatingId === role.id ? "Drafting…" : "Build résumé"}
                  </button>
                </div>
              </article>
              );
            })}
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
          ref={overlayRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`Editing ${expanded.application.resume_version ?? expanded.jobTitle}`}
          onClick={(event) => { if (event.target === event.currentTarget) setExpandedId(null); }}
        >
          <div className="studio-overlay-panel" style={{ width: "95vw", maxWidth: "1600px" }}>
            <header className="studio-overlay-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{expanded.application.resume_version ?? expanded.jobTitle}</strong>
                <small>
                  {expanded.jobId === MASTER_ID
                    ? masterSource ? `Laid out from ${masterSource.file_name}` : "Built from everything you can evidence"
                    : expanded.employer ?? "Employer not recorded"}
                </small>
              </div>
              {/*
                * Close, and only close. The downloads live in the toolbar under
                * the document, the same place they are in the inline editor;
                * a second pair up here was the same two buttons twice.
                */}
              <button type="button" className="secondary-button" onClick={() => setExpandedId(null)}>
                Close <span aria-hidden="true">✕</span>
              </button>
            </header>
            <div className="studio-overlay-body" style={{ padding: '0 20px 20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{renderWorkspace(expanded, true)}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
