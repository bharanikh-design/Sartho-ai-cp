"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analysisSetback, shouldAutoAnalyse, summariseAnalysis } from "@/lib/jobs/auto-analysis";
import { parseImportedJob, type ImportedJob } from "@/lib/jobs/imported-job";
import type { DeepAnalysisSummary, JobRecord } from "@/lib/types";

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
 *
 * And it does not stop at saved. A save scores the role on keywords; the
 * grounded analysis — every requirement in the advert, answered against
 * approved evidence — used to wait behind a button on a page the person had no
 * reason to open. So the one step that made the capture worth anything was the
 * one step they had to know to take. The send now runs it, and the answer is on
 * screen before they have left the job board tab.
 */

/*
 * The analysis runs after the save has already succeeded, so it never speaks
 * for the import. A role that is saved but unanalysed is a smaller problem than
 * a banner that reports a failure over a role sitting safely in the pipeline.
 */
type Analysis =
  | { phase: "running" }
  | { phase: "done"; summary: DeepAnalysisSummary }
  | { phase: "held"; reason: string }
  | { phase: "skipped" };

type Outcome =
  | { state: "importing"; title: string }
  | { state: "saved"; job: JobRecord; existing: boolean; captured: ImportedJob; analysis: Analysis }
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

  const rememberImport = useCallback(async (jobId: string, captured: ImportedJob) => {
    try {
      await fetch("/api/candidate/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "job_imported",
          source: "extension",
          jobId,
          metadata: {
            readBy: captured.readBy,
            capturedAt: captured.capturedAt,
          },
        }),
        keepalive: true,
      });
    } catch {
      // Import success must not depend on learning telemetry.
    }
  }, []);

  /*
   * Folded into whatever the banner is already showing, so an analysis that
   * finishes after the person has dismissed the banner cannot bring it back.
   */
  const settleAnalysis = useCallback((analysis: Analysis) => {
    setOutcome((current) => (current?.state === "saved" ? { ...current, analysis } : current));
  }, []);

  const analyse = useCallback(async (jobId: string) => {
    try {
      const operationId = crypto.randomUUID();
      const response = await fetch(`/api/jobs/${jobId}/deep-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId }),
      });
      const result = await response.json().catch(() => null) as
        { summary?: DeepAnalysisSummary; error?: string } | null;

      if (!response.ok || !result?.summary) {
        settleAnalysis({ phase: "held", reason: analysisSetback(response.status, result?.error) });
        return;
      }

      settleAnalysis({ phase: "done", summary: result.summary });
      /*
       * The analysis has also rewritten overall_match from evidenced coverage,
       * so the server-rendered ledger under this banner is now out of date in
       * the one way that matters.
       */
      router.refresh();
    } catch {
      settleAnalysis({ phase: "held", reason: analysisSetback(0) });
    }
  }, [router, settleAnalysis]);

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

      /*
       * Run outside the save's try, so a setback in the analysis can never be
       * mistaken for a failed import and send the role back to the queue.
       */
      let analysed: string | null = null;

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

        const job = result.job;
        acknowledge(data.id);
        void rememberImport(job.id, parsed.job);

        const wanted = shouldAutoAnalyse(job);
        setOutcome({
          state: "saved",
          job,
          existing: Boolean(result.existing),
          captured: parsed.job,
          analysis: wanted ? { phase: "running" } : { phase: "skipped" },
        });
        /* The ledger below is server-rendered, so it needs the refresh to show this. */
        router.refresh();

        analysed = wanted ? job.id : null;
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

      if (analysed) await analyse(analysed);
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
  }, [acknowledge, analyse, rememberImport, router]);

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

  const { job, existing, captured, analysis } = outcome;
  return (
    <section
      className={`glass-card import-banner is-saved${analysis.phase === "running" ? " is-analysing" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="import-banner__saved-mark" aria-hidden="true">✓</span>
      <div>
        <strong>
          {existing ? "Updated in Opportunities" : "Saved to Opportunities"}: {job.title}
        </strong>
        <p className="section-subtitle">
          {job.employer ? `${job.employer} · ` : ""}
          {job.overall_match !== null ? `${job.overall_match}% match against your approved evidence` : "Saved"}
          {job.recommendation ? ` · ${MATCH_LABEL[job.recommendation] ?? job.recommendation}` : ""}
          {existing ? " · you had already saved this advert, so it was refreshed rather than duplicated" : ""}
        </p>
        {/*
          * The second line is the one worth sending a role over for: not the
          * keyword score above it, but how much of the advert this person can
          * actually answer with evidence they have approved.
          */}
        {analysis.phase === "running" ? (
          <p className="section-subtitle import-banner__analysis">
            Saved safely. Sartho is analysing the requirements in the background — you can continue now.
          </p>
        ) : null}
        {analysis.phase === "done" ? (
          <p className="section-subtitle import-banner__analysis is-done">
            <strong>Analysed:</strong> {summariseAnalysis(analysis.summary)}
          </p>
        ) : null}
        {analysis.phase === "held" ? (
          <p className="section-subtitle import-banner__analysis is-held">{analysis.reason}</p>
        ) : null}
        {analysis.phase === "skipped" ? (
          <p className="section-subtitle import-banner__analysis">
            Already analysed against your Career Profile — open it for the requirement-by-requirement read.
          </p>
        ) : null}
        {/*
          * Read off the job board at the moment of capture, and shown once
          * here. It is not stored: Sartho keeps the advert, not a snapshot of
          * how many people had applied by Tuesday afternoon.
          */}
        {captured.applicants || captured.hiringManager ? (
          <p className="section-subtitle import-banner__intel">
            {captured.applicants ? <span>{captured.applicants}</span> : null}
            {captured.hiringManager ? <span>Hiring contact: {captured.hiringManager}</span> : null}
            {captured.jobPoster && captured.jobPoster !== captured.hiringManager ? <span>Posted by: {captured.jobPoster}</span> : null}
            {captured.applyUrl ? <a href={captured.applyUrl} target="_blank" rel="noreferrer">Apply on source ↗</a> : null}
            <span className="import-banner__intel-note">read from the job board just now, not saved</span>
          </p>
        ) : null}
      </div>
      <Link href={`/jobs/${job.id}`} className="primary-button">Open the role →</Link>
    </section>
  );
}
