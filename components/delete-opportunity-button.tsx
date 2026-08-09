"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteOpportunityButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to remove this opportunity.");
      router.push("/jobs");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove this opportunity.");
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>
        Remove opportunity
      </button>
    );
  }

  return (
    <div className="delete-opportunity-confirmation" role="group" aria-label="Confirm opportunity removal">
      <span>Remove this saved opportunity and its analysis?</span>
      <button type="button" className="secondary-button" disabled={deleting} onClick={() => { setConfirming(false); setError(null); }}>
        Keep it
      </button>
      <button type="button" className="danger-button" disabled={deleting} onClick={() => void remove()}>
        {deleting ? "Removing…" : "Yes, remove"}
      </button>
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}
