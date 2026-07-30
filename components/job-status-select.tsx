"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function JobStatusSelect({ jobId, initialStatus }: { jobId: string; initialStatus: JobStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: JobStatus) {
    const previous = status;
    setStatus(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update status.");
      router.refresh();
    } catch (caught) {
      setStatus(previous);
      setError(caught instanceof Error ? caught.message : "Unable to update status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="job-status-block">
      <label className="status-control">
        <span>Opportunity status</span>
        <select value={status} disabled={saving} onChange={(event) => void update(event.target.value as JobStatus)}>
          {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}
