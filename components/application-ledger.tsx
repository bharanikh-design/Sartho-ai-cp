"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  /*
   * The server's list wins whenever it changes.
   *
   * This list was seeded from props once and never looked at them again, so a
   * role saved elsewhere on the page — by the analyser, or by one sent from the
   * browser extension — called router.refresh(), the server re-rendered with
   * the new row, and this component went on showing the old array. The role was
   * genuinely saved and simply not on screen until a full reload, which reads
   * exactly like the save having failed.
   *
   * Adjusted during render rather than in an effect. React re-runs this
   * component immediately with the new state and commits once, where an effect
   * would paint the stale list first and then correct it.
   */
  const [renderedFrom, setRenderedFrom] = useState(initialJobs);
  if (renderedFrom !== initialJobs) {
    setRenderedFrom(initialJobs);
    setJobs(initialJobs);
  }

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; previous: JobStatus; label: string } | null>(null);
  /* Set by clicking a pipeline tile; clicking the same tile again clears it. */
  const [filter, setFilter] = useState<JobStatus | null>(null);

  /*
   * The pipeline is one row that scrolls, not a nine-tile block.
   *
   * Nine stages wrapped across two rows took most of a screen above the list
   * they filter, and eight of those nine are usually zero — a lot of height
   * spent on counts of nothing. One row keeps the whole funnel in its real
   * order, left to right, which is also how people describe it.
   *
   * A scroller nobody can tell is scrollable is a scroller nobody scrolls, so
   * the arrows appear only when there is something past the edge, and the
   * track is measured rather than assumed: on a wide screen all nine fit and no
   * arrow ever shows.
   */
  const track = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const node = track.current;
    if (!node) return;
    /* A pixel of slack: sub-pixel widths otherwise leave an arrow permanently on. */
    setOverflow({
      start: node.scrollLeft > 1,
      end: node.scrollLeft + node.clientWidth < node.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    measure();
    const node = track.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  function nudge(direction: 1 | -1) {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(node.clientWidth * 0.8, 180), behavior: "smooth" });
  }

  const visibleJobs = useMemo(
    () => (filter ? jobs.filter((job) => job.status === filter) : jobs),
    [jobs, filter],
  );

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

        <div className="pipeline-rail">
          <button
            type="button"
            className="pipeline-rail__nav"
            onClick={() => nudge(-1)}
            hidden={!overflow.start}
            aria-label="Show earlier stages"
          >
            ‹
          </button>

          <div className="pipeline-track" ref={track} onScroll={measure}>
            {/*
              * Each tile is a filter on the list below — a count you cannot act
              * on is only decoration.
              *
              * The stage's meaning moved off the tile face and into its
              * accessible name. "Roles worth considering" under "SAVED" is read
              * once and then costs vertical space on every visit afterwards,
              * and it was the single biggest reason this card was so tall.
              */}
            {statusOrder.map((status) => (
              <Link
                href={`#applications-list`}
                key={status.id}
                className={`pipeline-stage${counts.get(status.id) ? " has-items" : ""}${filter === status.id ? " is-filtered" : ""}`}
                onClick={() => setFilter((current) => (current === status.id ? null : status.id))}
                aria-pressed={filter === status.id}
                title={status.description}
                aria-label={`${status.label} — ${status.description}. ${counts.get(status.id) ?? 0} ${counts.get(status.id) === 1 ? "role" : "roles"}. Filter the list.`}
              >
                <span>{status.label}</span>
                <strong>{counts.get(status.id) ?? 0}</strong>
              </Link>
            ))}
          </div>

          <button
            type="button"
            className="pipeline-rail__nav"
            onClick={() => nudge(1)}
            hidden={!overflow.end}
            aria-label="Show later stages"
          >
            ›
          </button>
        </div>
      </section>

      <section className="glass-card content-card application-list-card" id="applications-list">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Your applications</h2>
            <p className="section-subtitle">
              {filter
                ? `Showing ${statusOrder.find((status) => status.id === filter)?.label ?? filter} only.`
                : "Move each role forward as the outcome changes."}
            </p>
          </div>
          {filter
            ? <button type="button" className="secondary-button" onClick={() => setFilter(null)}>Show all</button>
            : <Link href="#add-role" className="secondary-button">Analyse another role</Link>}
        </div>

        {error ? <div className="inline-error" role="alert">{error}</div> : null}

        {visibleJobs.length ? (
          <div className="application-list">
            {visibleJobs.map((job) => (
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
        ) : filter ? (
          <div className="empty-inline-state">
            Nothing at this stage yet. <button type="button" className="direction-inline-link" onClick={() => setFilter(null)}>Show all applications</button>
          </div>
        ) : (
          <div className="empty-inline-state">
            No applications yet. <Link href="#add-role">Analyse and save your first role</Link> above — it will track here through interview and outcome.
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
