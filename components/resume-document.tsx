"use client";

import { useEffect, useRef } from "react";
import type { ResumeBullet, ResumeContent } from "@/lib/resume/content";

/*
 * The résumé, as a document you can type into.
 *
 * It was a <pre> in monospace, read-only, with a side rail that could reach
 * only the bullets the ATS had flagged for having no number in them. So there
 * was no way to fix a typo, rewrite the summary, rename a section, or touch a
 * line that already carried a figure. The most common thing anybody wants to
 * do with a résumé — change a word — was the one thing the page could not do.
 *
 * Two decisions shape what is below.
 *
 * Editing happens in the document, in place, rather than in a side panel. A
 * panel forces you to hold two versions of a line in your head at once, and it
 * cannot show you what the change does to the page around it. Editing where the
 * words are is how every writing tool works, and it is why this is worth the
 * extra machinery.
 *
 * And every node is a textarea all the time, rather than swapping from text to
 * input on click. A field that only becomes editable once you have discovered
 * it is editable is a puzzle; one that always looks and behaves the same is a
 * document. The styling makes them read as prose — no borders until you are on
 * them — so it looks like a résumé and behaves like an editor.
 */

/*
 * A textarea that is exactly as tall as its text.
 *
 * Résumé lines wrap to two or three lines and a fixed-row textarea would either
 * clip them or leave a hole. Height is recomputed on every value change, not
 * only on input, so a line replaced by an accepted rewrite resizes too.
 */
function AutoTextarea({
  value,
  onChange,
  className,
  ariaLabel,
  placeholder,
  spellCheck = true,
}: {
  value: string;
  onChange: (next: string) => void;
  className: string;
  ariaLabel: string;
  placeholder?: string;
  spellCheck?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      rows={1}
      aria-label={ariaLabel}
      placeholder={placeholder}
      spellCheck={spellCheck}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/*
 * Whether a line can still point at the evidence that backed it.
 *
 * Three states, and the difference between them matters more here than
 * anywhere else in the product:
 *
 *   backed    generated from approved evidence and unchanged since.
 *   edited    the person rewrote it. It may well be true — it is their
 *             career — but Sartho can no longer say the evidence backs
 *             those words, so it does not say so.
 *   untracked recovered from a draft saved before per-line evidence was
 *             kept. Not "unbacked": nobody knows, and pretending either way
 *             would be a guess.
 *
 * This is the whole promise of the product applied to manual editing. You can
 * write anything you like; Sartho just never claims your edit is evidenced.
 */
function evidenceState(bullet: ResumeBullet, tracked: boolean): "backed" | "edited" | "untracked" {
  if (!tracked) return "untracked";
  if (bullet.edited) return "edited";
  return bullet.evidenceIds.length ? "backed" : "edited";
}

const EVIDENCE_LABEL: Record<"backed" | "edited" | "untracked", string> = {
  backed: "Backed by your approved evidence",
  edited: "Your own wording — Sartho is not claiming evidence for this line",
  untracked: "Saved before Sartho recorded evidence line by line",
};

/*
 * The rewrite loop, where the sentence is.
 *
 * It used to live in the right-hand rail, which reprinted the full text of
 * every weak bullet — the same sentences sitting a few inches to the left. That
 * duplication was most of what made the panel unreadable: a column of dense
 * small text restating the document you were already looking at.
 *
 * So the proposal opens underneath the line it rewrites. You read the original
 * and the suggestion in one place, in the same typography, with the rest of the
 * résumé around them for context — which is the only way to judge whether a
 * line actually fits.
 */
export type BulletCoach = {
  /** The bullet whose rewrite panel is open, if any. */
  activeId: string | null;
  /** Sartho's draft of the active line. Undefined while it is still being written. */
  proposal: string | undefined;
  questions: string[];
  /** Square-bracketed blanks still to fill; Accept stays shut while any remain. */
  blanks: string[];
  error: string | null;
  busy: boolean;
  onOpen: (bulletId: string, text: string) => void;
  onRetry: (bulletId: string, text: string) => void;
  onChange: (text: string) => void;
  onAccept: (bulletId: string) => void;
  onClose: () => void;
};

export function ResumeDocument({
  content,
  onChange,
  weakBulletIds,
  coach,
  readOnly = false,
}: {
  content: ResumeContent;
  onChange: (next: ResumeContent) => void;
  /** Bullets the ATS reader found no figure in, so the page can mark them. */
  weakBulletIds: Set<string>;
  coach?: BulletCoach;
  readOnly?: boolean;
}) {
  /*
   * Any bullet anywhere carrying evidence means this document's per-line
   * mapping survived. If none does, it was recovered from the text column and
   * the mapping never existed — a distinction the dots have to make, because
   * "no evidence" and "no record of evidence" are not the same claim.
   */
  const tracked = content.sections.some((section) => section.bullets.some((bullet) => bullet.evidenceIds.length));

  function editSection(sectionIndex: number, update: (section: ResumeContent["sections"][number]) => ResumeContent["sections"][number]) {
    onChange({
      ...content,
      sections: content.sections.map((section, index) => (index === sectionIndex ? update(section) : section)),
    });
  }

  function editBullet(sectionIndex: number, bulletIndex: number, text: string) {
    editSection(sectionIndex, (section) => ({
      ...section,
      bullets: section.bullets.map((bullet, index) =>
        index === bulletIndex
          ? { ...bullet, text, edited: bullet.edited || text.trim() !== bullet.text.trim() }
          : bullet,
      ),
    }));
  }

  function removeBullet(sectionIndex: number, bulletIndex: number) {
    editSection(sectionIndex, (section) => ({
      ...section,
      bullets: section.bullets.filter((_, index) => index !== bulletIndex),
    }));
  }

  function moveBullet(sectionIndex: number, bulletIndex: number, direction: -1 | 1) {
    const target = bulletIndex + direction;
    editSection(sectionIndex, (section) => {
      if (target < 0 || target >= section.bullets.length) return section;
      const bullets = [...section.bullets];
      [bullets[bulletIndex], bullets[target]] = [bullets[target], bullets[bulletIndex]];
      return { ...section, bullets };
    });
  }

  function addBullet(sectionIndex: number) {
    editSection(sectionIndex, (section) => ({
      ...section,
      /*
       * A line the person is about to write is theirs, so it starts edited and
       * with no evidence ids. It must never inherit a backing it never had.
       */
      bullets: [...section.bullets, {
        id: `${section.id}b${Date.now()}`,
        text: "",
        evidenceIds: [],
        edited: true,
      }],
    }));
  }

  if (readOnly) {
    return (
      <article className="resume-doc is-readonly" aria-label="Résumé draft">
        <h1 className="resume-doc-headline">{content.headline}</h1>
        {content.summary ? (
          <>
            <h2 className="resume-doc-heading">Professional summary</h2>
            <p className="resume-doc-summary">{content.summary}</p>
          </>
        ) : null}
        {content.sections.map((section) => (
          <section key={section.id}>
            {section.heading ? <h2 className="resume-doc-heading">{section.heading}</h2> : null}
            <ul className="resume-doc-bullets">
              {section.bullets.map((bullet) => <li key={bullet.id}>{bullet.text}</li>)}
            </ul>
          </section>
        ))}
      </article>
    );
  }

  return (
    <article className="resume-doc" aria-label="Résumé draft, editable">
      <AutoTextarea
        className="resume-doc-headline resume-doc-field"
        ariaLabel="Headline"
        placeholder="Your name and the role you are aiming at"
        value={content.headline}
        onChange={(headline) => onChange({ ...content, headline })}
      />

      <h2 className="resume-doc-heading">Professional summary</h2>
      <AutoTextarea
        className="resume-doc-summary resume-doc-field"
        ariaLabel="Professional summary"
        placeholder="Two or three sentences on what you do and what you are known for."
        value={content.summary}
        onChange={(summary) => onChange({ ...content, summary })}
      />

      {content.sections.map((section, sectionIndex) => (
        <section key={section.id} className="resume-doc-section">
          <AutoTextarea
            className="resume-doc-heading resume-doc-field"
            ariaLabel={`Section heading ${sectionIndex + 1}`}
            placeholder="Section heading"
            spellCheck={false}
            value={section.heading}
            onChange={(heading) => editSection(sectionIndex, (current) => ({ ...current, heading }))}
          />

          <ul className="resume-doc-bullets">
            {section.bullets.map((bullet, bulletIndex) => {
              const state = evidenceState(bullet, tracked);
              return (
                <li
                  key={bullet.id}
                  id={`bullet-${bullet.id}`}
                  className={`resume-doc-bullet${weakBulletIds.has(bullet.id) ? " is-weak" : ""}${coach?.activeId === bullet.id ? " is-coaching" : ""}`}
                >
                  <span
                    className={`resume-doc-evidence is-${state}`}
                    title={EVIDENCE_LABEL[state]}
                    aria-label={EVIDENCE_LABEL[state]}
                    role="img"
                  />
                  <AutoTextarea
                    className="resume-doc-field resume-doc-bullet-text"
                    ariaLabel={`Bullet ${bulletIndex + 1} of ${section.heading || `section ${sectionIndex + 1}`}`}
                    placeholder="Write a line."
                    value={bullet.text}
                    onChange={(text) => editBullet(sectionIndex, bulletIndex, text)}
                  />
                  <span className="resume-doc-bullet-tools">
                    <button
                      type="button"
                      title="Move up"
                      aria-label={`Move bullet ${bulletIndex + 1} up`}
                      disabled={bulletIndex === 0}
                      onClick={() => moveBullet(sectionIndex, bulletIndex, -1)}
                    >↑</button>
                    <button
                      type="button"
                      title="Move down"
                      aria-label={`Move bullet ${bulletIndex + 1} down`}
                      disabled={bulletIndex === section.bullets.length - 1}
                      onClick={() => moveBullet(sectionIndex, bulletIndex, 1)}
                    >↓</button>
                    <button
                      type="button"
                      title="Remove this line"
                      aria-label={`Remove bullet ${bulletIndex + 1}`}
                      onClick={() => removeBullet(sectionIndex, bulletIndex)}
                    >✕</button>
                  </span>

                  {/*
                    * The one control on a line that has no number in it. Offered
                    * here as well as from the rail, because the moment you
                    * notice a weak line is while you are reading it.
                    */}
                  {coach && weakBulletIds.has(bullet.id) && coach.activeId !== bullet.id ? (
                    <button
                      type="button"
                      className="resume-doc-coach-open"
                      onClick={() => coach.onOpen(bullet.id, bullet.text)}
                    >
                      Add a figure
                    </button>
                  ) : null}

                  {coach && coach.activeId === bullet.id ? (
                    <div className="resume-doc-coach">
                      {coach.error ? (
                        <div className="resume-doc-coach-failed" role="alert">
                          <p>{coach.error}</p>
                          <button type="button" className="secondary-button" onClick={() => coach.onRetry(bullet.id, bullet.text)}>
                            Try again
                          </button>
                        </div>
                      ) : coach.proposal === undefined ? (
                        <p className="resume-doc-coach-pending">Sartho is drafting a stronger version…</p>
                      ) : (
                        <>
                          <label htmlFor={`coach-${bullet.id}`}>
                            Sartho&rsquo;s version — replace anything in [brackets]. It will not guess a figure for you.
                          </label>
                          <textarea
                            id={`coach-${bullet.id}`}
                            rows={3}
                            value={coach.proposal}
                            onChange={(event) => coach.onChange(event.target.value)}
                          />
                          {coach.questions.length ? (
                            <ul className="resume-doc-coach-questions">
                              {coach.questions.map((question) => <li key={question}>{question}</li>)}
                            </ul>
                          ) : null}
                          <div className="resume-doc-coach-actions">
                            <button
                              type="button"
                              className="primary-button"
                              disabled={coach.blanks.length > 0 || !coach.proposal.trim()}
                              onClick={() => coach.onAccept(bullet.id)}
                            >
                              Use this line
                            </button>
                            <button type="button" className="secondary-button" onClick={coach.onClose}>Leave it</button>
                            {coach.blanks.length ? <small>Still to fill: {coach.blanks.join(", ")}</small> : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <button type="button" className="resume-doc-add" onClick={() => addBullet(sectionIndex)}>
            + Add a line
          </button>
        </section>
      ))}
    </article>
  );
}
