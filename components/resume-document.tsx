"use client";

import { useEffect, useRef } from "react";
import { contactLine, roleDates, roleWhere, type ResumeBullet, type ResumeContact, type ResumeContent, type ResumeRole, type ResumeSection } from "@/lib/resume/content";

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


/*
 * One bullet list, shared by a dated role and by a free section.
 *
 * The evidence dot, the weak-line flag, the rewrite panel, reordering and
 * removal were all written inside the sections loop. Bullets now live in two
 * places — under a role and under a section — and copying that machinery would
 * have guaranteed the two drifted, with the evidence dot working in one of them
 * and not the other.
 */
function CoachPanel({ coach, activeId, text }: { coach: BulletCoach; activeId: string; text: string }) {
  return (
    <div className="resume-doc-coach">
      {coach.error ? (
        <div className="resume-doc-coach-failed" role="alert">
          <p>{coach.error}</p>
          <button type="button" className="secondary-button" onClick={() => coach.onRetry(activeId, text)}>Try again</button>
        </div>
      ) : coach.proposal === undefined ? (
        <p className="resume-doc-coach-pending">Sartho is drafting a stronger version…</p>
      ) : (
        <>
          <label htmlFor={`coach-${activeId}`}>
            Sartho&rsquo;s version — replace anything in [brackets]. It will not guess a figure for you.
          </label>
          <textarea id={`coach-${activeId}`} rows={3} value={coach.proposal} onChange={(event) => coach.onChange(event.target.value)} />
          {coach.questions.length ? (
            <ul className="resume-doc-coach-questions">
              {coach.questions.map((question) => <li key={question}>{question}</li>)}
            </ul>
          ) : null}
          <div className="resume-doc-coach-actions">
            <button type="button" className="primary-button" disabled={coach.blanks.length > 0 || !coach.proposal.trim()} onClick={() => coach.onAccept(activeId)}>
              Use this line
            </button>
            <button type="button" className="secondary-button" onClick={coach.onClose}>Leave it</button>
            {coach.blanks.length ? <small>Still to fill: {coach.blanks.join(", ")}</small> : null}
          </div>
        </>
      )}
    </div>
  );
}

function BulletList({
  bullets,
  ownerLabel,
  tracked,
  weakBulletIds,
  coach,
  onEdit,
  onRemove,
  onMove,
  onAdd,
}: {
  bullets: ResumeBullet[];
  /** Named in the accessible label, so "Bullet 2 of Deloitte" means something. */
  ownerLabel: string;
  tracked: boolean;
  weakBulletIds: Set<string>;
  coach?: BulletCoach;
  onEdit: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <ul className="resume-doc-bullets">
        {bullets.map((bullet, bulletIndex) => {
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
                ariaLabel={`Bullet ${bulletIndex + 1} of ${ownerLabel}`}
                placeholder="Write a line."
                value={bullet.text}
                onChange={(text) => onEdit(bulletIndex, text)}
              />
              <span className="resume-doc-bullet-tools">
                <button type="button" title="Move up" aria-label={`Move bullet ${bulletIndex + 1} up`} disabled={bulletIndex === 0} onClick={() => onMove(bulletIndex, -1)}>↑</button>
                <button type="button" title="Move down" aria-label={`Move bullet ${bulletIndex + 1} down`} disabled={bulletIndex === bullets.length - 1} onClick={() => onMove(bulletIndex, 1)}>↓</button>
                <button type="button" title="Remove this line" aria-label={`Remove bullet ${bulletIndex + 1}`} onClick={() => onRemove(bulletIndex)}>✕</button>
              </span>

              {coach && weakBulletIds.has(bullet.id) && coach.activeId !== bullet.id ? (
                <div style={{ display: 'block', marginTop: '8px', marginBottom: '16px' }}>
                  <button type="button" style={{ 
                    border: "1px dashed rgba(224,176,97,.5)", 
                    borderRadius: "7px", 
                    padding: "6px 12px", 
                    color: "#e0b061", 
                    background: "rgba(224,176,97,.1)", 
                    fontFamily: "var(--font-sans)", 
                    fontSize: "12px", 
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }} onClick={() => coach.onOpen(bullet.id, bullet.text)}>
                    <span>✨</span> Add a figure to improve ATS score
                  </button>
                </div>
              ) : null}

              {coach && coach.activeId === bullet.id ? (
                <CoachPanel coach={coach} activeId={bullet.id} text={bullet.text} />
              ) : null}
            </li>
          );
        })}
      </ul>
      <button type="button" className="resume-doc-add" onClick={onAdd}>+ Add a line</button>
    </>
  );
}

/*
 * Ids for whatever somebody adds while editing.
 *
 * A counter rather than Date.now(), for two reasons. React treats a clock read
 * during render as impure — it can produce a different id every time the
 * component happens to re-render, which is a changing key on a live textarea.
 * And "new-1" cannot collide with the "r0" and "s0b0" that parsing derives
 * from position, where two timestamps a millisecond apart very nearly can.
 */
let added = 0;
const nextId = (prefix: string) => `${prefix}-new-${(added += 1)}`;

/*
 * A line somebody is about to write is theirs, so it starts edited and with no
 * evidence ids. It must never inherit a backing it never had.
 */
function blankBullet(prefix: string): ResumeBullet {
  return { id: nextId(`${prefix}b`), text: "", evidenceIds: [], edited: true };
}

/* The contact fields, in the order they are read across the line. */
const CONTACT_FIELDS: Array<{ key: keyof ResumeContact; label: string; placeholder: string }> = [
  { key: "email", label: "Email", placeholder: "you@example.com" },
  { key: "phone", label: "Phone", placeholder: "+61 400 000 000" },
  { key: "location", label: "Location", placeholder: "Melbourne, VIC" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/you" },
  { key: "website", label: "Website", placeholder: "yourportfolio.com" },
];

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
  const tracked = [...content.roles, ...content.sections].some((group) =>
    group.bullets.some((bullet) => bullet.evidenceIds.length));

  function editRole(roleIndex: number, update: (role: ResumeRole) => ResumeRole) {
    onChange({ ...content, roles: content.roles.map((role, index) => (index === roleIndex ? update(role) : role)) });
  }

  function editSection(sectionIndex: number, update: (section: ResumeSection) => ResumeSection) {
    onChange({ ...content, sections: content.sections.map((section, index) => (index === sectionIndex ? update(section) : section)) });
  }

  const bulletHandlers = (
    bullets: ResumeBullet[],
    prefix: string,
    commit: (next: ResumeBullet[]) => void,
  ) => ({
    onEdit: (index: number, text: string) =>
      commit(bullets.map((bullet, at) => (at === index
        ? { ...bullet, text, edited: bullet.edited || text.trim() !== bullet.text.trim() }
        : bullet))),
    onRemove: (index: number) => commit(bullets.filter((_, at) => at !== index)),
    onMove: (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= bullets.length) return;
      const next = [...bullets];
      [next[index], next[target]] = [next[target], next[index]];
      commit(next);
    },
    onAdd: () => commit([...bullets, blankBullet(prefix)]),
  });

  if (readOnly) {
    const contact = contactLine(content.contact);
    return (
      <article className="resume-doc is-readonly" data-template={content.template} aria-label="Résumé draft">
        <header className="resume-doc-identity">
          <h1 className="resume-doc-name">{content.name}</h1>
          {content.targetRole ? <p className="resume-doc-target">{content.targetRole}</p> : null}
          {contact ? <p className="resume-doc-contact">{contact}</p> : null}
        </header>

        {content.summary ? (
          <>
            <h2 className="resume-doc-heading">Professional summary</h2>
            <p className="resume-doc-summary">{content.summary}</p>
          </>
        ) : null}

        {content.roles.length ? (
          <>
            <h2 className="resume-doc-heading">Experience</h2>
            {content.roles.map((role) => (
              <div className="resume-doc-role" key={role.id}>
                <div className="resume-doc-role-line">
                  <span className="resume-doc-role-title">{role.title}</span>
                  <span className="resume-doc-role-dates">{roleDates(role)}</span>
                </div>
                {roleWhere(role) ? <p className="resume-doc-role-where">{roleWhere(role)}</p> : null}
                <ul className="resume-doc-bullets">
                  {role.bullets.map((bullet) => <li key={bullet.id}>{bullet.text}</li>)}
                </ul>
              </div>
            ))}
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

        {content.skills.length ? (
          <>
            <h2 className="resume-doc-heading">Skills</h2>
            <ul className="resume-doc-skills">
              {content.skills.map((skill) => <li key={skill}>{skill}</li>)}
            </ul>
          </>
        ) : null}

        {content.education.length ? (
          <>
            <h2 className="resume-doc-heading">Education</h2>
            {content.education.map((entry) => (
              <div className="resume-doc-education" key={entry.id}>
                <span>{[entry.qualification, entry.institution].filter(Boolean).join(", ")}</span>
                <span className="resume-doc-education-year">{entry.year}</span>
              </div>
            ))}
          </>
        ) : null}
      </article>
    );
  }

  return (
    <article className="resume-doc" data-template={content.template} aria-label="Résumé draft, editable">
      <header className="resume-doc-identity">
        <AutoTextarea
          className="resume-doc-name resume-doc-field"
          ariaLabel="Your name"
          placeholder="Your name"
          value={content.name}
          onChange={(name) => onChange({ ...content, name })}
        />
        <AutoTextarea
          className="resume-doc-target resume-doc-field"
          ariaLabel="The role you are aiming at"
          placeholder="The role you are aiming at"
          value={content.targetRole}
          onChange={(targetRole) => onChange({ ...content, targetRole })}
        />
        {/*
          * Contact details as separate boxes rather than one line to type.
          * They are five different things, one of them is checked against a
          * pattern by half the recruiters who read it, and a single free line
          * is how a phone number ends up in the LinkedIn field.
          */}
        <div className="resume-doc-contact-fields">
          {CONTACT_FIELDS.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                type="text"
                value={content.contact[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => onChange({ ...content, contact: { ...content.contact, [field.key]: event.target.value } })}
              />
            </label>
          ))}
        </div>
      </header>

      <h2 className="resume-doc-heading">Professional summary</h2>
      <AutoTextarea
        className="resume-doc-summary resume-doc-field"
        ariaLabel="Professional summary"
        placeholder="Two or three sentences on what you do and what you are known for."
        value={content.summary}
        onChange={(summary) => onChange({ ...content, summary })}
      />
      {coach && coach.activeId !== "summary" ? (
        <div style={{ display: 'block', marginTop: '8px', marginBottom: '24px' }}>
          <button type="button" style={{ 
            border: "1px dashed rgba(224,176,97,.5)", 
            borderRadius: "7px", 
            padding: "6px 12px", 
            color: "#e0b061", 
            background: "rgba(224,176,97,.1)", 
            fontFamily: "var(--font-sans)", 
            fontSize: "12px", 
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px"
          }} onClick={() => coach.onOpen("summary", content.summary)}>
            <span>✨</span> Improve summary with AI
          </button>
        </div>
      ) : null}
      {coach && coach.activeId === "summary" ? (
        <div style={{ marginBottom: '24px' }}>
          <CoachPanel coach={coach} activeId="summary" text={content.summary} />
        </div>
      ) : null}

      <h2 className="resume-doc-heading">Experience</h2>
      {content.roles.map((role, roleIndex) => (
        <div className="resume-doc-role is-editing" key={role.id}>
          <div className="resume-doc-role-fields">
            <label className="is-wide">
              <span>Job title</span>
              <input type="text" value={role.title} placeholder="Senior Financial Analyst" onChange={(event) => editRole(roleIndex, (current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="is-wide">
              <span>Employer</span>
              <input type="text" value={role.employer} placeholder="Deloitte" onChange={(event) => editRole(roleIndex, (current) => ({ ...current, employer: event.target.value }))} />
            </label>
            <label>
              <span>Location</span>
              <input type="text" value={role.location} placeholder="Sydney" onChange={(event) => editRole(roleIndex, (current) => ({ ...current, location: event.target.value }))} />
            </label>
            <label>
              <span>From</span>
              <input type="text" value={role.start} placeholder="Jan 2022" onChange={(event) => editRole(roleIndex, (current) => ({ ...current, start: event.target.value }))} />
            </label>
            <label>
              <span>To</span>
              <input type="text" value={role.end} placeholder="Dec 2024" disabled={role.current} onChange={(event) => editRole(roleIndex, (current) => ({ ...current, end: event.target.value }))} />
            </label>
            <label className="resume-doc-role-current">
              <input type="checkbox" checked={role.current} onChange={(event) => editRole(roleIndex, (current) => ({ ...current, current: event.target.checked }))} />
              <span>I still work here</span>
            </label>
            <button
              type="button"
              className="resume-doc-role-remove"
              aria-label={`Remove ${role.employer || role.title || `role ${roleIndex + 1}`}`}
              onClick={() => onChange({ ...content, roles: content.roles.filter((_, index) => index !== roleIndex) })}
            >Remove role</button>
          </div>
          <BulletList
            bullets={role.bullets}
            ownerLabel={role.employer || role.title || `role ${roleIndex + 1}`}
            tracked={tracked}
            weakBulletIds={weakBulletIds}
            coach={coach}
            {...bulletHandlers(role.bullets, role.id, (bullets) => editRole(roleIndex, (current) => ({ ...current, bullets })))}
          />
        </div>
      ))}
      <button
        type="button"
        className="resume-doc-add"
        onClick={() => onChange({
          ...content,
          roles: [...content.roles, { id: nextId("r"), title: "", employer: "", location: "", start: "", end: "", current: false, bullets: [] }],
        })}
      >+ Add a role</button>

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
          <BulletList
            bullets={section.bullets}
            ownerLabel={section.heading || `section ${sectionIndex + 1}`}
            tracked={tracked}
            weakBulletIds={weakBulletIds}
            coach={coach}
            {...bulletHandlers(section.bullets, section.id, (bullets) => editSection(sectionIndex, (current) => ({ ...current, bullets })))}
          />
        </section>
      ))}

      <h2 className="resume-doc-heading">Skills</h2>
      {/*
        * One comma-separated line rather than a tag editor. Everybody already
        * knows how to type a list, and a chip UI here would be a week of work
        * to make the same string harder to paste into.
        */}
      <AutoTextarea
        className="resume-doc-skills-field resume-doc-field"
        ariaLabel="Skills, separated by commas"
        placeholder="Excel, SQL, Power BI, stakeholder reporting"
        spellCheck={false}
        value={content.skills.join(", ")}
        onChange={(value) => onChange({ ...content, skills: value.split(",").map((skill) => skill.trim()).filter(Boolean) })}
      />

      <h2 className="resume-doc-heading">Education</h2>
      {content.education.map((entry, index) => (
        <div className="resume-doc-education-fields" key={entry.id}>
          <label className="is-wide">
            <span>Qualification</span>
            <input type="text" value={entry.qualification} placeholder="BCom (Finance)" onChange={(event) => onChange({ ...content, education: content.education.map((item, at) => (at === index ? { ...item, qualification: event.target.value } : item)) })} />
          </label>
          <label className="is-wide">
            <span>Institution</span>
            <input type="text" value={entry.institution} placeholder="University of Melbourne" onChange={(event) => onChange({ ...content, education: content.education.map((item, at) => (at === index ? { ...item, institution: event.target.value } : item)) })} />
          </label>
          <label>
            <span>Year</span>
            <input type="text" value={entry.year} placeholder="2022" onChange={(event) => onChange({ ...content, education: content.education.map((item, at) => (at === index ? { ...item, year: event.target.value } : item)) })} />
          </label>
          <button
            type="button"
            className="resume-doc-role-remove"
            aria-label={`Remove ${entry.qualification || `education entry ${index + 1}`}`}
            onClick={() => onChange({ ...content, education: content.education.filter((_, at) => at !== index) })}
          >Remove</button>
        </div>
      ))}
      <button
        type="button"
        className="resume-doc-add"
        onClick={() => onChange({
          ...content,
          education: [...content.education, { id: nextId("ed"), qualification: "", institution: "", year: "" }],
        })}
      >+ Add education</button>
    </article>
  );
}
