"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeepAnalysisPanel({
  jobId,
  status,
  approvedEvidenceCount,
}: {
  jobId: string;
  status: "not_started" | "processing" | "complete" | "failed";
  approvedEvidenceCount: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/deep-analysis`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Deep analysis failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Deep analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  const buttonLabel = running
    ? "Analysing approved evidence…"
    : status === "complete"
      ? "Run deep analysis again"
      : status === "failed"
        ? "Retry deep analysis"
        : "Run deep analysis";

  return (
    <div className="deep-analysis-action">
      <button
        type="button"
        className="primary-button"
        onClick={() => void runAnalysis()}
        disabled={running || !approvedEvidenceCount}
      >
        {buttonLabel} <span aria-hidden="true">✦</span>
      </button>
      <span>{approvedEvidenceCount} approved evidence records available</span>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </div>
  );
}
