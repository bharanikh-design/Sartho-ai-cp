"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * What you said you would do next, and when.
 *
 * The Command Centre has always been able to lead with this — it looks for the
 * first active application carrying a `next_action` and makes it the headline
 * follow-up — but no screen could write one, so it never found one and always
 * fell back to "Review N active applications". That is the difference between
 * a tracker that tells you what you decided and one that counts rows at you.
 */

export function NextActionField({
  jobId,
  initialAction,
  initialDate,
}: {
  jobId: string;
  initialAction: string | null;
  initialDate: string | null;
}) {
  const router = useRouter();
  const [action, setAction] = useState(initialAction ?? "");
  const [date, setDate] = useState(initialDate ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = action.trim() !== (initialAction ?? "").trim() || date !== (initialDate ?? "");

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/jobs/${jobId}/next-action`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextAction: action.trim() || null,
          nextActionDate: date || null,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not save that next action.");
      setSaved(true);
      /* So the Command Centre picks it up without a manual reload. */
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not save that next action.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="next-action-field">
      <label className="next-action-input">
        <span>Your next move</span>
        <input
          type="text"
          value={action}
          maxLength={200}
          placeholder="Follow up with the hiring manager"
          onChange={(event) => { setAction(event.target.value); setSaved(false); }}
          aria-label="Next action for this application"
        />
      </label>
      <label className="next-action-input is-date">
        <span>By</span>
        <input
          type="date"
          value={date}
          /* A date on its own says nothing, so it is only offered alongside one. */
          disabled={!action.trim()}
          onChange={(event) => { setDate(event.target.value); setSaved(false); }}
          aria-label="Date for this next action"
        />
      </label>
      <button type="button" className="secondary-button" onClick={() => void save()} disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save"}
      </button>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {saved && !error ? <span className="next-action-saved" role="status">Saved — your dashboard will lead with this.</span> : null}
    </div>
  );
}
