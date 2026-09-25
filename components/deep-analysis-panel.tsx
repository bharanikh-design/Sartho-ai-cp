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
      void fetch("/api/candidate/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "deep_analysis_requested",
          source: "pipeline",
          jobId,
        }),
        keepalive: true,
      }).catch(() => undefined);

      const operationId = crypto.randomUUID();
      const response = await fetch(`/api/jobs/${jobId}/deep-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Deep analysis failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Deep analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  const buttonLabel = running || status === "processing"
    ? "Matching your Career Profile…"
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
        disabled={running || status === "processing" || !approvedEvidenceCount}
      >
        {buttonLabel} <span aria-hidden="true">✦</span>
      </button>
      <span>{approvedEvidenceCount ? "Your confirmed Career Profile is ready for matching" : "Confirm your Career Profile before running this analysis"}</span>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </div>
  );
}
