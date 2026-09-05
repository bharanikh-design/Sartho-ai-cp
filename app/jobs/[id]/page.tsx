import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteOpportunityButton } from "@/components/delete-opportunity-button";
import { DeepAnalysisPanel } from "@/components/deep-analysis-panel";
import { JobStatusSelect } from "@/components/job-status-select";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getJobWorkspace } from "@/lib/data/jobs";
import { presentRuleAnalysis } from "@/lib/matching/present-rule-analysis";
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
  const analysisPresentation = analysis ? presentRuleAnalysis(analysis, job.technical_heaviness) : null;
  const summary = job.deep_analysis_summary;

  return (
    <div className="page-stack">
      <ProductPageHeader
        eyebrow="Opportunity decision"
        title={job.title}
        description={`${job.employer ?? "Employer not recorded"}${job.location ? ` · ${job.location}` : ""}. Review the signal, evidence mapping and preparation outputs in that order.`}
        metric={{ value: <JobStatusSelect jobId={job.id} initialStatus={job.status} initialOutcome={application ? { stage: application.outcome_stage, reason: application.outcome_reason, note: application.outcome_note, recordedAt: application.outcome_recorded_at } : null} />, label: "current stage" }}
      />

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
            <div className="persisted-analysis">
              {/*
                One row of plain values. These were four bordered tiles, one of
                which ("Profile support") was a heuristic — matched-skill
                strength × 12 — that read as a percentage, sat beside "meets 0
                of 1 mandatory requirements", and could not be reconciled with
                it. It is gone; what is left are the three figures the score is
                actually made of.
              */}
              <dl className="signal-row">
                <div><dt>Strongest match</dt><dd>{analysisPresentation?.strongestMatch}</dd></div>
                {typeof analysis.titleFit === "number" ? (
                  <div><dt>Title fit</dt><dd>{analysis.titleFit}%{analysis.closestTitle ? <small> vs {analysis.closestTitle}</small> : null}</dd></div>
                ) : null}
                {typeof analysis.requirementCoverage === "number" ? (
                  <div><dt>You can evidence</dt><dd>{analysis.requirementCoverage}% of what it asks for</dd></div>
                ) : null}
              </dl>
              {analysis.matchedSignals.length ? (
                <div className="chip-row">{analysis.matchedSignals.map((value) => <span key={value} className="signal-chip">{value}</span>)}</div>
              ) : null}
              {analysis.cautionSignals.length ? (
                <p className="match-gap">Not yet evidenced: {analysis.cautionSignals.join(", ")}</p>
              ) : null}
              <p className="analysis-explanation">{analysis.explanation}</p>
            </div>
          ) : <div className="empty-inline-state">No preliminary analysis is stored for this role.</div>}
        </article>

        <article className="glass-card content-card next-card action-next-card">
          <div className="page-eyebrow">Career Profile match</div>
          <h3>{job.deep_analysis_status === "complete" ? "Requirement mapping complete" : "Map the role to your Career Profile"}</h3>
          <p>Sartho uses only the Career Profile information you have confirmed. Every suggested match remains traceable to your résumé.</p>
          <div className="impact-row"><span>Confirmed profile details</span><strong>{approvedEvidence?.length ?? 0} records</strong></div>
          <div className="impact-row"><span>Status</span><strong>{job.deep_analysis_status.replaceAll("_", " ")}</strong></div>
          <DeepAnalysisPanel jobId={job.id} status={job.deep_analysis_status} approvedEvidenceCount={approvedEvidence?.length ?? 0} />
        </article>
      </section>

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

      {requirements.length ? (
        <section className="glass-card content-card requirements-section">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Requirements versus Career Profile</div>
              <h2 className="section-heading">Meets {summary?.mandatoryMet ?? 0} of {summary?.mandatoryTotal ?? 0} mandatory requirements</h2>
              <p className="section-subtitle">Every verdict shows which Career Profile information supports it.</p>
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
            <p>Run the Career Profile match above to extract the requirements and show where your background supports them.</p>
          </div>
        </section>
      )}

      <div className="page-footer-actions">
        <div className="job-detail-management">
          <Link href="/applications" className="secondary-button">← Back to applications</Link>
          <DeleteOpportunityButton jobId={job.id} />
        </div>
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
          <summary>{citedEvidence.length} supporting Career Profile record{citedEvidence.length === 1 ? "" : "s"}</summary>
          <div>{citedEvidence.map((evidence) => <article key={evidence.id}><p>{evidence.claim}</p><small>{evidence.source_name ?? "Source not recorded"}{evidence.source_locator ? ` · ${evidence.source_locator}` : ""}</small></article>)}</div>
        </details>
      ) : <div className="requirement-gap">Your Career Profile does not currently support this requirement.</div>}
    </article>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}
