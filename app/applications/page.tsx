import Link from "next/link";

const statuses = [
  ["Saved", "Roles worth considering"],
  ["Analysed", "Fit and gaps understood"],
  ["Approved", "Ready for preparation"],
  ["Applied", "Submission completed"],
  ["Acknowledged", "Employer confirmation"],
  ["Assessment", "Action required"],
  ["Interview", "Conversation scheduled"],
  ["Offer / Rejected", "Final outcome"],
];

export default function ApplicationsPage() {
  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Outcome ledger</div>
        <h1 className="page-title">Applications</h1>
        <p className="page-description">
          One factual timeline for every opportunity, résumé version, acknowledgement, interview and next action.
          Nothing falls through the cracks—and nothing is submitted without your approval.
        </p>
      </section>

      <section className="glass-card pipeline-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Application pipeline</h2>
            <p className="section-subtitle">Your complete journey from saved role to final outcome.</p>
          </div>
          <span className="meta-pill"><span className="live-dot" /> Tracking ready</span>
        </div>

        <div className="pipeline-grid">
          {statuses.map(([status, description]) => (
            <article key={status} className="pipeline-stage">
              <span>{status}</span>
              <strong>0</strong>
              <p className="section-subtitle">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card empty-ledger">
        <div className="empty-ledger-inner">
          <div className="empty-ledger-icon" aria-hidden="true">↗</div>
          <h3>Your application ledger is ready</h3>
          <p>Analyse the first opportunity. Once you approve it, Sartho will create the application record and preserve every next step here.</p>
          <Link href="/jobs" className="primary-button">Analyse the first job <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </div>
  );
}
