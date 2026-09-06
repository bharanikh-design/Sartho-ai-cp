"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BULLET_MARKER, bulletsIn, scoreAts } from "@/lib/resume/ats";
import { unfilledBlanks } from "@/lib/resume/bullet-rewrite";
import { RESUME_ACCEPT } from "@/lib/resume/upload";

/*
 * Improve the résumé you already have.
 *
 * The Studio could only build a draft from scratch, tailored to one analysed
 * role. That is the right thing when you are applying for something, and no use
 * at all when you already have a CV you want to make better.
 *
 * What this does NOT do is generate. There is no advert to aim at and no
 * approved evidence backing pasted text, so anything it invented would be
 * invention with nothing behind it. It reads what is there, says which lines
 * carry no measurable result, and rewrites those lines around a figure the
 * person types. The same guard as everywhere else refuses a rewrite carrying a
 * number that was in neither input.
 *
 * Making it the master résumé is deliberately a hand-off, not a save: the
 * career profile is built by reading a résumé into approved evidence, and that
 * is ResumeImport's job on Career Truth. This sends the improved text there
 * rather than growing a second, quieter way in.
 */

export function ResumeWorkbench() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openBullet, setOpenBullet] = useState<number | null>(null);
  /*
   * The proposal, and what the person has made of it. `drafts` holds an
   * editable line; `asked` holds the questions the model says would make it
   * strongest. Both are cached per bullet so reopening one never spends again.
   */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [asked, setAsked] = useState<Record<number, string[]>>({});
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /* No analysis: the role-specific check abstains and says so. */
  const ats = scoreAts(text, null);
  const bullets = bulletsIn(text);

  async function readFile(file: File) {
    setBusy("file");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/resume/read", { method: "POST", body });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok || !result.text) throw new Error(result.error ?? "Sartho could not read that file.");
      setText(result.text);
      setDrafts({});
      setAsked({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not read that file.");
    } finally {
      setBusy(null);
    }
  }

  /*
   * Sartho drafts first. Opening a line asks for the stronger version of it,
   * with every figure the model cannot know left as a labelled blank — so
   * there is something to react to rather than an empty box and a demand.
   *
   * Fired on open rather than on a button, because a suggestion you have to
   * ask for twice is not a suggestion. Cached per bullet, so reopening one is
   * free; the earlier mistake with Career Direction was spending on every page
   * load, and this only spends when a specific line is deliberately opened.
   */
  async function propose(index: number, bullet: string) {
    if (drafts[index] !== undefined || busy) return;
    setBusy(`bullet-${index}`);
    setError(null);
    try {
      const response = await fetch("/api/resume/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bullet }),
      });
      const result = await response.json() as { rewritten?: string; questions?: string[]; error?: string };
      if (!response.ok || !result.rewritten) throw new Error(result.error ?? "Sartho could not draft this line.");
      setDrafts((state) => ({ ...state, [index]: result.rewritten as string }));
      setAsked((state) => ({ ...state, [index]: result.questions ?? [] }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not draft this line.");
    } finally {
      setBusy(null);
    }
  }

  function openBulletAt(index: number, bullet: string) {
    const next = openBullet === index ? null : index;
    setOpenBullet(next);
    if (next !== null) void propose(next, bullet);
  }

  /** Replace one bullet in the text, leaving everything around it alone. */
  function accept(index: number, replacement: string) {
    let seen = -1;
    setText((current) => current
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        /* The same marker set bulletsIn counts, so the indexes cannot disagree. */
        if (!BULLET_MARKER.test(trimmed)) return line;
        seen += 1;
        if (seen !== index) return line;
        const marker = trimmed[0];
        const indent = line.slice(0, line.indexOf(marker));
        return `${indent}${marker} ${replacement}`;
      })
      .join("\n"));
    setOpenBullet(null);
  }

  return (
    <div className="workbench">
      <div className="workbench-intake">
        <label htmlFor="workbench-text">
          Paste your résumé, or read one in from a file. Nothing is saved until you choose to.
        </label>
        <textarea
          id="workbench-text"
          rows={text ? 14 : 6}
          placeholder="Paste the text of your current résumé here…"
          value={text}
          onChange={(event) => { setText(event.target.value); setDrafts({}); setAsked({}); }}
        />
        <div className="workbench-intake-actions">
          <input
            ref={fileInput}
            type="file"
            accept={RESUME_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
          <button type="button" className="secondary-button" disabled={busy === "file"} onClick={() => fileInput.current?.click()}>
            {busy === "file" ? "Reading…" : "Read from a file"}
          </button>
          {text ? (
            <button type="button" className="secondary-button" onClick={() => { setText(""); setDrafts({}); setAsked({}); }}>
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      {text.trim() ? (
        <div className="workbench-review">
          <div className="workbench-score">
            <span className="studio-ats-badge">{ats.score}<small>ATS</small></span>
            <div>
              <strong>How this reads to a filter</strong>
              <small>
                {ats.wordCount} words · {bullets.length} bullet{bullets.length === 1 ? "" : "s"}
                {" · "}{ats.weakBullets.length} with no figure
              </small>
            </div>
          </div>

          <ul className="studio-ats-checks">
            {/*
              * The first check needs a role to compare against and says so
              * rather than inventing an opinion; this résumé is aimed at
              * nothing in particular yet.
              */}
            {ats.checks.slice(1).map((check) => (
              <li key={check.label}>
                <span aria-hidden="true">{check.state === "pass" ? "✓" : check.state === "warn" ? "!" : "×"}</span>
                <div><strong>{check.label}</strong><small>{check.detail}</small></div>
              </li>
            ))}
          </ul>

          {ats.weakBullets.length ? (
            <div className="studio-fixes">
              <strong>Lines worth a number</strong>
              <small>Sartho drafts the stronger version first, leaving a blank where it would otherwise have to guess. Fill those in, edit anything, then use it.</small>
              {ats.weakBullets.map((bullet) => {
                const isOpen = openBullet === bullet.index;
                const draft = drafts[bullet.index];
                const blanks = draft ? unfilledBlanks(draft) : [];
                const questions = asked[bullet.index] ?? [];
                return (
                  <div className="studio-fix" key={bullet.index}>
                    <button
                      type="button"
                      className="studio-fix-line"
                      onClick={() => openBulletAt(bullet.index, bullet.text)}
                      aria-expanded={isOpen}
                    >
                      {bullet.text}
                    </button>
                    {isOpen ? (
                      <div className="studio-fix-form">
                        {draft === undefined ? (
                          <p className="studio-fix-pending">
                            {busy === `bullet-${bullet.index}` ? "Sartho is drafting a stronger version…" : "Nothing drafted yet."}
                          </p>
                        ) : (
                          <>
                            <label htmlFor={`wb-draft-${bullet.index}`}>
                              Sartho&rsquo;s version. Replace anything in [brackets] — it will not guess a figure for you.
                            </label>
                            <textarea
                              id={`wb-draft-${bullet.index}`}
                              rows={3}
                              value={draft}
                              onChange={(event) => setDrafts((state) => ({ ...state, [bullet.index]: event.target.value }))}
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
                                disabled={blanks.length > 0 || !draft.trim()}
                                onClick={() => accept(bullet.index, draft.trim())}
                              >
                                Use this line
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => setOpenBullet(null)}
                              >
                                Leave it
                              </button>
                              {blanks.length ? (
                                <small>Still to fill: {blanks.join(", ")}</small>
                              ) : null}
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

          {/*
            * A hand-off, not a save. The career profile is built by reading a
            * résumé into approved evidence, which is ResumeImport's job on
            * Career Truth — this points there rather than becoming a second,
            * quieter way in.
            */}
          <div className="workbench-finish">
            <div>
              <strong>Make this your master résumé</strong>
              <small>
                Copy the improved text, then upload or paste it on Career Truth. Sartho reads it into your
                approved evidence, and every tailored draft afterwards is built from that.
              </small>
            </div>
            <div className="workbench-finish-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={async () => {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                }}
              >
                {copied ? "Copied ✓" : "Copy improved résumé"}
              </button>
              <Link href="/career-truth#resume" className="primary-button">Open Career Truth →</Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
