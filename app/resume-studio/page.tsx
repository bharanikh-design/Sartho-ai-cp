import Link from "next/link";
import { ResumeImport } from "@/components/resume-import";
import { ResumeLibrary } from "@/components/resume-library";
import { requireUser } from "@/lib/auth";
import { getResumeImports } from "@/lib/data/career";
import { getJobs } from "@/lib/data/jobs";
import type { ApplicationRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ResumeStudioPage() {
  const { supabase, user } = await requireUser();
  const [jobs, applicationsResult, approvedResult, imports] = await Promise.all([
    getJobs(supabase, user.id),
    supabase.from("applications").select("*").eq("user_id", user.id).not("resume_draft", "is", null).order("updated_at", { ascending: false }),
    supabase.from("evidence_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("approval_status", "approved").eq("safe_for_resume", true),
    getResumeImports(supabase, user.id),
  ]);

  if (applicationsResult.error) throw applicationsResult.error;
  if (approvedResult.error) throw approvedResult.error;

  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const applications = (applicationsResult.data ?? []) as ApplicationRecord[];
  const readyJobs = jobs.filter((job) => job.deep_analysis_status === "complete" && !applications.some((application) => application.job_id === job.id));
  const approvedCount = approvedResult.count ?? 0;

  return (
    <div className="page-stack">
      <section className="hero-panel glass-card">
        <div className="hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Résumé Studio</div>
          <h1>Shape the résumé<br />the role deserves.</h1>
          <p>Keep one confirmed Career Profile and produce separate job-specific drafts that highlight the right achievements without rewriting history.</p>
          <div className="hero-actions">
            <Link href="/jobs" className="primary-button">Analyse a role <span aria-hidden="true">↗</span></Link>
            <Link href="/career-truth" className="secondary-button">Strengthen Career Profile</Link>
          </div>
        </div>

        <div className="home-hero-signal" aria-label="Résumé Studio readiness">
          <span className="signal-label">Résumé principle</span>
          <strong>Tailor the story. Never invent it.</strong>
          <p>{approvedCount ? "Your confirmed Career Profile is available for truthful drafting." : "Confirm your Career Profile before creating job-specific drafts."}</p>
        </div>
      </section>

      <section className="metric-grid action-metric-grid" aria-label="Résumé workspace status">
        <article className="glass-card-soft metric-card action-metric">
          <span className="metric-icon" aria-hidden="true">01</span>
          <div className="metric-label">Career Profile</div>
          <div className="metric-value">{approvedCount ? "Ready" : "Review"}</div>
          <div className="metric-note">One confirmed source for truthful drafting</div>
          <Link href="/career-truth" className="metric-action">Review Career Profile<span aria-hidden="true">→</span></Link>
        </article>
        <article className="glass-card-soft metric-card action-metric">
          <span className="metric-icon" aria-hidden="true">02</span>
          <div className="metric-label">Jobs ready to draft</div>
          <div className="metric-value">{readyJobs.length}</div>
          <div className="metric-note">Deep analysis complete, no draft yet</div>
          <Link href="/jobs" className="metric-action">Open jobs<span aria-hidden="true">→</span></Link>
        </article>
        <article className="glass-card-soft metric-card action-metric">
          <span className="metric-icon" aria-hidden="true">03</span>
          <div className="metric-label">Tailored drafts</div>
          <div className="metric-value">{applications.length}</div>
          <div className="metric-note">Separate versions with complete change logs</div>
          <span className="metric-action">Review below<span aria-hidden="true">↓</span></span>
        </article>
      </section>

      {readyJobs.length ? (
        <section className="glass-card content-card">
          <div className="card-header">
            <div><h2 className="section-heading">Ready for a tailored draft</h2><p className="section-subtitle">These roles have already been matched to your Career Profile.</p></div>
            <span className="meta-pill">{readyJobs.length} ready</span>
          </div>
          <div className="saved-job-list">
            {readyJobs.map((job) => (
              <Link href={`/jobs/${job.id}`} className="saved-job-row" key={job.id}>
                <div><span className="saved-job-employer">{job.employer ?? "Employer not recorded"}</span><strong>{job.title}</strong><small>Open the role to draft a résumé</small></div>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="glass-card content-card">
        <div className="card-header">
          <div><h2 className="section-heading">Job-specific résumé drafts</h2><p className="section-subtitle">Every draft remains clearly labelled for review and keeps its change log.</p></div>
          <span className="meta-pill">{applications.length} versions</span>
        </div>

        {applications.length ? (
          <div className="resume-version-list">
            {applications.map((application) => {
              const job = jobById.get(application.job_id);
              return (
                <Link href={`/jobs/${application.job_id}`} className="resume-version-row" key={application.id}>
                  <div>
                    <span>Draft — review before use</span>
                    <strong>{application.resume_version ?? job?.title ?? "Tailored résumé"}</strong>
                    <small>{job?.employer ?? "Employer not recorded"} · {application.resume_change_log.length} change-log entries</small>
                  </div>
                  <span aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-ledger-inner">
            <div className="empty-ledger-icon" aria-hidden="true">R</div>
            <h3>No tailored drafts yet</h3>
            <p>Save a role, complete the role analysis and create the first profile-backed résumé draft from its job page.</p>
            <Link href="/jobs" className="primary-button">Analyse a role <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      <section className="glass-card content-card source-resume-section" id="source-resumes">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Source résumés</h2>
            <p className="section-subtitle">Manage the documents Sartho uses to keep your Career Profile current. Additional uploads are reconciled with what is already known.</p>
          </div>
          <span className="meta-pill">{imports.length} document{imports.length === 1 ? "" : "s"}</span>
        </div>
        <ResumeImport hasEvidence={approvedCount > 0} showLead={false} continueHref="/career-truth#profile-review" />
        <div className="source-resume-library">
          <ResumeLibrary imports={imports} />
        </div>
      </section>
    </div>
  );
}
