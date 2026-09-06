"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseImportedJob, type ImportedJob } from "@/lib/jobs/imported-job";
import type { JobRecord } from "@/lib/types";

/*
 * Where a role sent from LinkedIn actually lands.
 *
 * The extension queues a capture and waits; this is the half that says "I am
 * here, give it to me", saves it, and only then tells the extension it may
 * forget it. Nothing is cleared on the extension's side until the save has
 * come back, so a role survives a reload, a signed-out session, and a failed
 * request — it arrives on the next visit instead of vanishing.
 *
 * It saves without asking. That is the point of the feature: one click on a
 * job board and the role is in the pipeline with a real score against approved
 * evidence. The check that would otherwise happen here happens earlier, in the
 * extension's own window, which shows exactly what it read before sending —
 * and the save is reversible, editable, and deduplicated, so a wrong capture
 * costs a click rather than a duplicate row.
 */

type Outcome =
  | { state: "importing"; title: string }
  | { state: "saved"; job: JobRecord; existing: boolean; captured: ImportedJob }
  | { state: "failed"; reason: string };

const MATCH_LABEL: Record<string, string> = {
  apply: "Worth applying",
  review: "Worth a read",
  skip: "Weak match",
};

export function JobImportBridge() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  /*
   * The extension re-offers a queued role whenever this page loads, and both
   * sides announce themselves, so the same job can be offered twice within a
   * second. Without this, that is two saves racing each other.
   */
  const handling = useRef<string | null>(null);

  const acknowledge = useCallback((id: string) => {
    window.postMessage({ source: "sartho-app", type: "SARTHO_IMPORTED", id }, window.location.origin);
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      /* Only this page may speak for this page — an iframe may not import roles. */
      if (event.source !== window) return;
      const data = event.data as { source?: string; type?: string; id?: string; payload?: unknown } | null;
      if (!data || data.source !== "sartho-extension" || data.type !== "SARTHO_IMPORT_JOB") return;
      if (!data.id || handling.current === data.id) return;
      handling.current = data.id;

      const parsed = parseImportedJob(data.payload);
      if (!parsed.ok) {
        /*
         * A capture that can never be saved is acknowledged, not retried. Left
         * queued, it would greet the person with the same failure on every
         * visit and block the next role behind it.
         */
        acknowledge(data.id);
        setOutcome({ state: "failed", reason: parsed.reason });
        return;
      }

      setOutcome({ state: "importing", title: parsed.job.title });

      try {
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: parsed.job.title,
            employer: parsed.job.employer,
            location: parsed.job.location,
            sourceUrl: parsed.job.sourceUrl,
            description: parsed.job.description,
          }),
        });
        const result = await response.json() as { job?: JobRecord; existing?: boolean; error?: string };
        if (!response.ok || !result.job) throw new Error(result.error ?? "Sartho could not save this role.");

        acknowledge(data.id);
        setOutcome({ state: "saved", job: result.job, existing: Boolean(result.existing), captured: parsed.job });
        /* The ledger below is server-rendered, so it needs the refresh to show this. */
        router.refresh();
      } catch (caught) {
        /*
         * Deliberately not acknowledged. The role stays queued in the
         * extension, so reloading or signing in delivers it rather than
         * needing the person to go back to the job board and find it again.
         */
        handling.current = null;
        setOutcome({
          state: "failed",
          reason: caught instanceof Error ? caught.message : "Sartho could not save this role.",
        });
      }
    };

    window.addEventListener("message", onMessage);
    /*
     * Announced after the listener is attached, never before. This is the
     * message that makes the handoff safe: the extension has no way to know
     * when React has mounted, so it waits to be asked instead of guessing at a
     * delay — which is exactly how the old version lost roles.
     */
    window.postMessage({ source: "sartho-app", type: "SARTHO_READY" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [acknowledge, router]);

  if (!outcome) return null;

  if (outcome.state === "importing") {
    return (
      <section className="glass-card import-banner" role="status" aria-live="polite">
        <span className="import-banner__spinner" aria-hidden="true" />
        <div>
          <strong>Adding {outcome.title} to your pipeline…</strong>
          <p className="section-subtitle">Scoring it against the evidence you approved.</p>
        </div>
      </section>
    );
  }

  if (outcome.state === "failed") {
    return (
      <section className="glass-card import-banner is-failed" role="alert">
        <div>
          <strong>That role did not come through</strong>
          <p className="section-subtitle">{outcome.reason}</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => setOutcome(null)}>Dismiss</button>
      </section>
    );
  }

  const { job, existing, captured } = outcome;
  return (
    <section className="glass-card import-banner is-saved" role="status" aria-live="polite">
      <div>
        <strong>
          {existing ? "Updated in your pipeline" : "Added to your pipeline"}: {job.title}
        </strong>
        <p className="section-subtitle">
          {job.employer ? `${job.employer} · ` : ""}
          {job.overall_match !== null ? `${job.overall_match}% match against your approved evidence` : "Saved"}
          {job.recommendation ? ` · ${MATCH_LABEL[job.recommendation] ?? job.recommendation}` : ""}
          {existing ? " · you had already saved this advert, so it was refreshed rather than duplicated" : ""}
        </p>
        {/*
          * Read off the job board at the moment of capture, and shown once
          * here. It is not stored: Sartho keeps the advert, not a snapshot of
          * how many people had applied by Tuesday afternoon.
          */}
        {captured.applicants || captured.hiringManager ? (
          <p className="section-subtitle import-banner__intel">
            {captured.applicants ? <span>{captured.applicants}</span> : null}
            {captured.hiringManager ? <span>Hiring contact: {captured.hiringManager}</span> : null}
            <span className="import-banner__intel-note">read from the job board just now, not saved</span>
          </p>
        ) : null}
      </div>
      <Link href={`/jobs/${job.id}`} className="primary-button">Open the role →</Link>
    </section>
  );
}
