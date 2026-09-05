"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BULLET_MARKER, bulletsIn, scoreAts } from "@/lib/resume/ats";
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
  const [facts, setFacts] = useState<Record<number, string>>({});
  const [rewrites, setRewrites] = useState<Record<number, string>>({});
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
      setRewrites({});
      setFacts({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not read that file.");
    } finally {
      setBusy(null);
    }
  }

  async function improve(index: number, bullet: string) {
    const fact = (facts[index] ?? "").trim();
    if (!fact || busy) return;
    setBusy(`bullet-${index}`);
    setError(null);
    try {
      const response = await fetch("/api/resume/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bullet, fact }),
      });
      const result = await response.json() as { rewritten?: string; error?: string };
      if (!response.ok || !result.rewritten) throw new Error(result.error ?? "Sartho could not rewrite this line.");
      setRewrites((state) => ({ ...state, [index]: result.rewritten as string }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not rewrite this line.");
    } finally {
      setBusy(null);
    }
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
    setRewrites((state) => { const next = { ...state }; delete next[index]; return next; });
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
          onChange={(event) => { setText(event.target.value); setRewrites({}); }}
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
            <button type="button" className="secondary-button" onClick={() => { setText(""); setRewrites({}); setFacts({}); }}>
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
              <small>Sartho will not invent a figure. Tell it what actually happened and it rewrites the line around your words.</small>
              {ats.weakBullets.map((bullet) => {
                const isOpen = openBullet === bullet.index;
                const rewritten = rewrites[bullet.index];
                return (
                  <div className="studio-fix" key={bullet.index}>
                    <button
                      type="button"
                      className="studio-fix-line"
                      onClick={() => setOpenBullet(isOpen ? null : bullet.index)}
                      aria-expanded={isOpen}
                    >
                      {bullet.text}
                    </button>
                    {isOpen ? (
                      <div className="studio-fix-form">
                        <label htmlFor={`wb-fact-${bullet.index}`}>What was the number, scale or result?</label>
                        <textarea
                          id={`wb-fact-${bullet.index}`}
                          rows={2}
                          placeholder="about 40,000 rows, over six weeks, for a team of 3"
                          value={facts[bullet.index] ?? ""}
                          onChange={(event) => setFacts((state) => ({ ...state, [bullet.index]: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={!(facts[bullet.index] ?? "").trim() || busy === `bullet-${bullet.index}`}
                          onClick={() => void improve(bullet.index, bullet.text)}
                        >
                          {busy === `bullet-${bullet.index}` ? "Rewriting…" : "Rewrite this line"}
                        </button>
                        {rewritten ? (
                          <div className="studio-fix-result">
                            <p>{rewritten}</p>
                            <div>
                              <button type="button" className="primary-button" onClick={() => accept(bullet.index, rewritten)}>
                                Use this
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => setRewrites((state) => { const next = { ...state }; delete next[bullet.index]; return next; })}
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
