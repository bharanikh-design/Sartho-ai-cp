"use client";

import { useEffect, useRef, useState } from "react";

/*
 * What is happening to your résumé, while it happens.
 *
 * The import used to be a button that changed its label and a page that then
 * sat still for up to two minutes. The work is real and it is slow — a document
 * is read, a model goes through it line by line, claims are written down — and
 * none of that was visible, so the honest reading of the screen was that it had
 * died.
 *
 * There is no percentage here because the server does not have one to give. The
 * model does not report progress, and a bar filling at an invented rate would
 * be a lie told by a product whose entire argument is that it does not tell
 * them. What is shown instead is true: the stage it is actually on, the counts
 * it has actually found, the seconds that have actually passed — and the text
 * of your own document, with a light moving down it, because that is literally
 * what is being read.
 */

export type ImportStage = "extracted" | "reading" | "saving" | "done";

export type ImportProgress = {
  stage: ImportStage;
  fileName: string;
  characters: number;
  sample: string;
  roles: number;
  claims: number;
};

const STEPS: Array<{ id: ImportStage; title: string; active: string }> = [
  { id: "extracted", title: "Read the document", active: "Opening the file and pulling the text out" },
  { id: "reading", title: "Find every role and achievement", active: "Going through it line by line" },
  { id: "saving", title: "Record them for your review", active: "Writing them down as claims, not facts" },
];

const ORDER: ImportStage[] = ["extracted", "reading", "saving", "done"];

function elapsedLabel(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ResumeProgress({ progress }: { progress: ImportProgress }) {
  const [seconds, setSeconds] = useState(0);
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  /*
   * The text drifts while the model is the thing taking the time. It stops the
   * moment there is nothing left to read, so the motion always means something
   * rather than running as decoration.
   */
  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane || progress.stage !== "reading") return;

    let frame = 0;
    let offset = 0;
    const tick = () => {
      const limit = pane.scrollHeight - pane.clientHeight;
      if (limit > 0) {
        offset = (offset + 0.35) % (limit + 120);
        pane.scrollTop = Math.min(offset, limit);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [progress.stage]);

  const reached = ORDER.indexOf(progress.stage);

  return (
    <div className="import-progress" role="status" aria-live="polite">
      <div className="import-progress-head">
        <div>
          <span className="import-progress-eyebrow">Reading your résumé</span>
          <strong className="import-progress-file">{progress.fileName}</strong>
        </div>
        <span className="import-progress-clock" aria-label={`${seconds} seconds elapsed`}>
          {elapsedLabel(seconds)}
        </span>
      </div>

      {/*
        * Your document, dimmed, with a light passing over it. Not an animation
        * standing in for the work — the actual text that is being read.
        */}
      <div className={`import-scan${progress.stage === "reading" ? " is-scanning" : ""}`} aria-hidden="true">
        <pre ref={scrollRef} className="import-scan-text">{progress.sample || " "}</pre>
        <span className="import-scan-beam" />
      </div>

      <ol className="import-steps">
        {STEPS.map((step, index) => {
          const state = reached > index ? "is-done" : reached === index ? "is-active" : "";
          return (
            <li key={step.id} className={`import-step ${state}`}>
              <span className="import-step-dot" aria-hidden="true">{reached > index ? "✓" : index + 1}</span>
              <span className="import-step-body">
                <strong>{step.title}</strong>
                <small>{reached === index ? step.active : detail(step.id, progress, reached > index)}</small>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="import-progress-note">
        Nothing Sartho finds is used anywhere until you have read it and approved it.
      </p>
    </div>
  );
}

/*
 * Once a step is behind us it stops describing itself and reports what it
 * found, so the list turns into a record of the work rather than a caption.
 */
function detail(id: ImportStage, progress: ImportProgress, done: boolean) {
  if (!done) return "Waiting";
  if (id === "extracted") {
    return progress.characters
      ? `${progress.characters.toLocaleString("en-GB")} characters`
      : "Done";
  }
  if (id === "reading") {
    return progress.claims
      ? `${progress.claims} claim${progress.claims === 1 ? "" : "s"} across ${progress.roles} role${progress.roles === 1 ? "" : "s"}`
      : "Done";
  }
  return "Done";
}
