"use client";

import { useEffect } from "react";

export function InteractionBeacon({
  jobId,
  eventType = "job_opened",
}: {
  jobId: string;
  eventType?: "job_opened" | "deep_analysis_requested";
}) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/candidate/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        source: "pipeline",
        jobId,
      }),
      keepalive: true,
      signal: controller.signal,
    }).catch(() => undefined);

    return () => controller.abort();
  }, [eventType, jobId]);

  return null;
}
