"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { JobRecord, JobStatus } from "@/lib/types";

const statusOrder: Array<{ id: JobStatus; label: string; description: string }> = [
  { id: "saved", label: "Saved", description: "Roles worth considering" },
  { id: "analysed", label: "Analysed", description: "Fit and gaps understood" },
  { id: "approved", label: "Approved", description: "Ready for preparation" },
  { id: "applied", label: "Applied", description: "Submission completed" },
  { id: "acknowledged", label: "Acknowledged", description: "Employer confirmation" },
  { id: "assessment", label: "Assessment", description: "Action required" },
  { id: "interview", label: "Interview", description: "Conversation scheduled" },
  { id: "offer", label: "Offer", description: "Offer received" },
  { id: "rejected", label: "Rejected", description: "Opportunity closed" },
];

export function ApplicationLedger({ initialJobs }: { initialJobs: JobRecord[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; previous: JobStatus; label: string } | null>(null);

  const counts = useMemo(() => {
    const result = new Map<JobStatus, number>();
    statusOrder.forEach((status) => result.set(status.id, 0));
    jobs.forEach((job) => result.set(job.status, (result.get(job.status) ?? 0) + 1));
    return result;
  }, [jobs]);

  async function persistStatus(id: string, status: JobStatus) {
    const response = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json() as { job?: JobRecord; error?: string };
    if (!response.ok || !result.job) throw new Error(result.error ?? "Unable to update the opportunity.");
    return result.job;
  }

  async function changeStatus(job: JobRecord, status: JobStatus) {
    if (busyId || job.status === status) return;
    const previous = job.status;
    setBusyId(job.id);
    setError(null);
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status } : item));

    try {
      const saved = await persistStatus(job.id, status);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, ...saved } : item));
      setUndo({ id: job.id, previous, label: `${job.title} moved to ${status}` });
    } catch (caught) {
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: previous } : item));
      setError(caught instanceof Error ? caught.message : "Unable to update the opportunity.");
    } finally {
      setBusyId(null);
    }
  }

  async function undoChange() {
    if (!undo || busyId) return;
    const job = jobs.find((item) => item.id === undo.id);
    if (!job) return;
    const currentStatus = job.status;
    setBusyId(job.id);
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: undo.previous } : item));
    try {
      const saved = await persistStatus(job.id, undo.previous);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, ...saved } : item));
      setUndo(null);
    } catch (caught) {
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: currentStatus } : item));
      setError(caught instanceof Error ? caught.message : "Unable to undo the change.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="glass-card pipeline-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Application pipeline</h2>
            <p className="section-subtitle">Live counts from your private opportunity ledger.</p>
          </div>
          <span className="meta-pill"><span className="live-dot" /> {jobs.length} opportunities</span>
        </div>

        <div className="pipeline-grid live-pipeline-grid">
          {statusOrder.map((status) => (
            <article key={status.id} className={`pipeline-stage${counts.get(status.id) ? " has-items" : ""}`}>
              <span>{status.label}</span>
              <strong>{counts.get(status.id) ?? 0}</strong>
              <p className="section-subtitle">{status.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card content-card application-list-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Opportunity ledger</h2>
            <p className="section-subtitle">Move each role forward as the real-world outcome changes.</p>
          </div>
          <Link href="/jobs" className="secondary-button">Analyse another role</Link>
        </div>

        {error ? <div className="inline-error" role="alert">{error}</div> : null}

        {jobs.length ? (
          <div className="application-list">
            {jobs.map((job) => (
              <article className="application-row" key={job.id}>
                <Link href={`/jobs/${job.id}`} className="application-main-link">
                  <span>{job.employer ?? "Employer not recorded"}</span>
                  <strong>{job.title}</strong>
                  <small>{job.location ?? "Location not recorded"} · {job.recommendation ?? "Awaiting recommendation"}</small>
                </Link>
                <label className="status-control">
                  <span>Status</span>
                  <select
                    value={job.status}
                    disabled={busyId === job.id}
                    onChange={(event) => void changeStatus(job, event.target.value as JobStatus)}
                    aria-label={`Status for ${job.title}`}
                  >
                    {statusOrder.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </label>
                <Link href={`/jobs/${job.id}`} className="application-open" aria-label={`Open ${job.title}`}>→</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-ledger-inner">
            <div className="empty-ledger-icon" aria-hidden="true">↗</div>
            <h3>Your application ledger is ready</h3>
            <p>Analyse and save the first opportunity. Its status, résumé draft and next actions will remain connected here.</p>
            <Link href="/jobs" className="primary-button">Analyse the first job <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      {undo ? (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={() => void undoChange()} disabled={Boolean(busyId)}>Undo</button>
          <button type="button" className="toast-close" onClick={() => setUndo(null)} aria-label="Dismiss notification">×</button>
        </div>
      ) : null}
    </>
  );
}
