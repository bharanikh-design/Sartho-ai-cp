"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  isTerminalOutcome,
  OUTCOME_REASON_LABELS,
  OUTCOME_REASONS,
  OUTCOME_STAGE_LABELS,
  type OutcomeReason,
  type OutcomeStage,
} from "@/lib/applications/outcome";
import type { JobStatus } from "@/lib/types";

const statuses: Array<{ value: JobStatus; label: string }> = [
  { value: "saved", label: "Saved" },
  { value: "analysed", label: "Analysed" },
  { value: "approved", label: "Approved" },
  { value: "applied", label: "Applied" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "assessment", label: "Assessment" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export type OutcomeSummary = {
  stage: string | null;
  reason: string | null;
  note: string | null;
  recordedAt: string | null;
};

/*
 * The status control, and — when a role ends — the one question worth asking
 * at that moment: why. Ending an application is the single most useful thing
 * the record can learn from, so unlike every other status change it is not
 * fired on selection; it opens a short form and is written once, with its
 * reason, in a single request. That keeps the recorded stage honest: the
 * server reads the stage from the status the role held before this change, and
 * a fire-first-ask-later flow would have already overwritten it.
 */
export function JobStatusSelect({
  jobId,
  initialStatus,
  initialOutcome = null,
}: {
  jobId: string;
  initialStatus: JobStatus;
  initialOutcome?: OutcomeSummary | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pendingStatus, setPendingStatus] = useState<JobStatus | null>(null);
  const [reason, setReason] = useState<OutcomeReason | "">(
    (initialOutcome?.reason as OutcomeReason | undefined) ?? "",
  );
  const [note, setNote] = useState(initialOutcome?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(next: JobStatus, outcome?: { reason: OutcomeReason | ""; note: string }) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          ...(outcome?.reason ? { outcomeReason: outcome.reason } : {}),
          ...(outcome?.note.trim() ? { outcomeNote: outcome.note.trim() } : {}),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update status.");
      setStatus(next);
      setPendingStatus(null);
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update status.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function onSelect(next: JobStatus) {
    setError(null);
    if (isTerminalOutcome(next)) {
      // Reveal the reason form; nothing is written until it is confirmed.
      setPendingStatus(next);
      return;
    }
    setPendingStatus(null);
    void send(next);
  }

  // The status shown in the picker follows a pending terminal choice so the
  // form and the select agree while the reason is being entered.
  const shownStatus = pendingStatus ?? status;
  const editingRecorded = pendingStatus === null && isTerminalOutcome(status);
  const formOpen = pendingStatus !== null || editingRecorded;
  const formStatus = pendingStatus ?? status;

  return (
    <div className="job-status-block">
      <label className="status-control">
        <span>Opportunity status</span>
        <select
          value={shownStatus}
          disabled={saving}
          onChange={(event) => onSelect(event.target.value as JobStatus)}
        >
          {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>

      {formOpen ? (
        <form
          className="outcome-capture"
          onSubmit={(event) => {
            event.preventDefault();
            void send(formStatus, { reason, note });
          }}
        >
          <p className="outcome-capture-lead">
            {formStatus === "rejected" ? "Why did this close?" : "Why are you withdrawing?"}
            {" "}
            <span>One answer here is what lets Sartho spot a pattern across applications later.</span>
          </p>

          <label className="status-control">
            <span>Reason</span>
            <select value={reason} disabled={saving} onChange={(event) => setReason(event.target.value as OutcomeReason | "")}>
              <option value="">Add a reason…</option>
              {OUTCOME_REASONS.map((value) => (
                <option key={value} value={value}>{OUTCOME_REASON_LABELS[value]}</option>
              ))}
            </select>
          </label>

          <label className="status-control">
            <span>Note (optional)</span>
            <input
              value={note}
              disabled={saving}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything specific worth remembering"
            />
          </label>

          <div className="outcome-capture-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving…" : editingRecorded ? "Update outcome" : `Mark ${formStatus}`}
            </button>
            {pendingStatus ? (
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => { setPendingStatus(null); setError(null); }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {editingRecorded && initialOutcome?.recordedAt ? (
        <p className="outcome-recorded-meta">
          Ended at {outcomeStageLabel(initialOutcome.stage)} · recorded {formatDate(initialOutcome.recordedAt)}
        </p>
      ) : null}

      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}

function outcomeStageLabel(stage: string | null) {
  if (stage && stage in OUTCOME_STAGE_LABELS) return OUTCOME_STAGE_LABELS[stage as OutcomeStage].toLowerCase();
  return "an unknown stage";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
