import Link from "next/link";
import { notFound } from "next/navigation";
import { DeepAnalysisPanel } from "@/components/deep-analysis-panel";
import { JobStatusSelect } from "@/components/job-status-select";
import { ResumeDraftPanel } from "@/components/resume-draft-panel";
import { requireUser } from "@/lib/auth";
import { getJobWorkspace } from "@/lib/data/jobs";
import type { EvidenceRecord, JobRequirementRecord, RequirementType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { job, requirements, application } = await getJobWorkspace(supabase, user.id, id);
  if (!job) notFound();

  const { data: approvedEvidence, error: evidenceError } = await supabase
    .from("evidence_items")
    .select("id,claim,source_name,source_locator")
    .eq("user_id", user.id)
    .eq("approval_status", "approved");
  if (evidenceError) throw evidenceError;

  const evidenceMap = new Map((approvedEvidence ?? []).map((item) => [item.id, item as Pick<EvidenceRecord, "id" | "claim" | "source_name" | "source_locator">]));
  const analysis = job.rule_analysis;
  const summary = job.deep_analysis_summary;

  return (
    <div className="page-stack">
      <section className="glass-card page-header-card job-detail-header">
        <div>
          <div className="page-eyebrow"><span className="live-dot" /> Saved opportunity</div>
          <h1 className="page-title">{job.title}</h1>
          <p className="page-description">{job.employer ?? "Employer not recorded"}{job.location ? ` · ${job.location}` : ""}</p>
        </div>
        <JobStatusSelect jobId={job.id} initialStatus={job.status} />
      </section>

      <section className="dashboard-grid job-summary-grid">
        <article className="glass-card content-card">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Rule-based first pass</div>
              <h2 className="section-heading">Opportunity signal</h2>
            </div>
            {job.recommendation ? <span className={`status-chip recommendation-${job.recommendation}`}>{job.recommendation}</span> : null}
          </div>

          {analysis ? (
            <div className="decision-result persisted-analysis">
              <div className="result-tile"><span>Best-fit lane</span><strong>{analysis.primaryLane}</strong></div>
              <div className="result-tile"><span>Technical heaviness</span><strong>{analysis.technicalHeaviness}/100</strong></div>
              <div className="signal-section">
                <h4>Relevant signals</h4>
                <div className="chip-row">{analysis.matchedSignals.map((value) => <span key={value} className="signal-chip">{value}</span>)}</div>
              </div>
              <div className="signal-section">
                <h4>Caution signals</h4>
                {analysis.cautionSignals.length ? <div className="chip-row">{analysis.cautionSignals.map((value) => <span key={value} className="signal-chip">{value}</span>)}</div> : <p>No material caution signal.</p>}
              </div>
              <p className="analysis-explanation">{analysis.explanation}</p>
            </div>
          ) : <div className="empty-inline-state">No preliminary analysis is stored for this role.</div>}
        </article>

        <article className="glass-card content-card next-card action-next-card">
          <div className="page-eyebrow">Evidence-led analysis</div>
          <h3>{job.deep_analysis_status === "complete" ? "Requirement mapping complete" : "Map the role to Career Profile evidence"}</h3>
          <p>Only approved evidence is sent to the AI provider. Every claimed match must resolve to a real approved evidence record.</p>
          <div className="impact-row"><span>Approved evidence</span><strong>{approvedEvidence?.length ?? 0} records</strong></div>
          <div className="impact-row"><span>Status</span><strong>{job.deep_analysis_status.replaceAll("_", " ")}</strong></div>
          <DeepAnalysisPanel jobId={job.id} status={job.deep_analysis_status} approvedEvidenceCount={approvedEvidence?.length ?? 0} />
        </article>
      </section>

      {requirements.length ? (
        <section className="glass-card content-card requirements-section">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Requirements versus evidence</div>
              <h2 className="section-heading">Meets {summary?.mandatoryMet ?? 0} of {summary?.mandatoryTotal ?? 0} mandatory requirements</h2>
              <p className="section-subtitle">Every verdict remains attached to the exact evidence used to support it.</p>
            </div>
            <span className="meta-pill">{requirements.length} requirements</span>
          </div>

          <div className="analysis-summary-grid">
            <SummaryMetric label="Mandatory" value={`${summary?.mandatoryMet ?? 0}/${summary?.mandatoryTotal ?? 0}`} />
            <SummaryMetric label="Preferred" value={`${summary?.preferredMet ?? 0}/${summary?.preferredTotal ?? 0}`} />
            <SummaryMetric label="Honest gaps" value={String(summary?.honestGaps.length ?? 0)} />
          </div>

          {(["mandatory", "preferred", "contextual"] as RequirementType[]).map((type) => {
            const group = requirements.filter((requirement) => requirement.requirement_type === type);
            if (!group.length) return null;
            return (
              <div className="requirement-group" key={type}>
                <h3>{type}</h3>
                <div className="requirement-list">
                  {group.map((requirement) => <RequirementCard key={requirement.id} requirement={requirement} evidenceMap={evidenceMap} />)}
                </div>
              </div>
            );
          })}

          {summary?.recruiterSignals.length ? (
            <aside className="recruiter-lens">
              <span>Recruiter lens · AI inference, not stated fact</span>
              <div className="chip-row">{summary.recruiterSignals.map((signal) => <span className="signal-chip" key={signal}>{signal}</span>)}</div>
            </aside>
          ) : null}
        </section>
      ) : (
        <section className="glass-card content-card empty-analysis-state">
          <div className="empty-ledger-inner">
            <div className="empty-ledger-icon" aria-hidden="true">✦</div>
            <h3>Deep analysis has not been run yet</h3>
            <p>Run the explicit evidence analysis above to extract requirements and map them to approved Career Profile evidence.</p>
          </div>
        </section>
      )}

      <ResumeDraftPanel jobId={job.id} deepAnalysisComplete={job.deep_analysis_status === "complete"} application={application} />

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Original job description</h2>
            <p className="section-subtitle">The exact source used for every analysis and résumé decision.</p>
          </div>
          {job.source_url ? <a href={job.source_url} target="_blank" rel="noreferrer" className="secondary-button">Open source ↗</a> : null}
        </div>
        <div className="job-description-reader">{job.raw_description}</div>
      </section>

      <div className="page-footer-actions">
        <Link href="/jobs" className="secondary-button">← Back to jobs</Link>
        <Link href="/applications" className="primary-button">Open Applications <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  );
}

function RequirementCard({ requirement, evidenceMap }: { requirement: JobRequirementRecord; evidenceMap: Map<string, Pick<EvidenceRecord, "id" | "claim" | "source_name" | "source_locator">> }) {
  const citedEvidence = requirement.matched_evidence_ids.map((evidenceId) => evidenceMap.get(evidenceId)).filter(Boolean) as Array<Pick<EvidenceRecord, "id" | "claim" | "source_name" | "source_locator">>;
  return (
    <article className={`requirement-card assessment-${requirement.assessment}`}>
      <div className="requirement-heading">
        <div><span>{requirement.category ?? "Requirement"}</span><h4>{requirement.requirement_text}</h4></div>
        <div className="requirement-verdict"><strong>{requirement.assessment.replaceAll("_", " ")}</strong><small>{requirement.confidence} confidence</small></div>
      </div>
      <p>{requirement.rationale ?? "No rationale stored."}</p>
      {citedEvidence.length ? (
        <details className="evidence-citations">
          <summary>{citedEvidence.length} cited evidence record{citedEvidence.length === 1 ? "" : "s"}</summary>
          <div>{citedEvidence.map((evidence) => <article key={evidence.id}><p>{evidence.claim}</p><small>{evidence.source_name ?? "Source not recorded"}{evidence.source_locator ? ` · ${evidence.source_locator}` : ""}</small></article>)}</div>
        </details>
      ) : <div className="requirement-gap">No approved evidence supports this requirement.</div>}
    </article>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}
