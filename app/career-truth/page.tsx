import { careerProfile, evidenceItems } from "@/data/profile";

export default function CareerTruthPage() {
  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Career foundation</div>
        <h1 className="page-title">Career Truth</h1>
        <p className="page-description">
          The factual source behind every match, résumé and application answer. Sartho will never invent a skill,
          metric, certification or responsibility—and it will only use claims you have approved.
        </p>

        <div className="summary-grid">
          <Summary label="Evidence records" value={String(evidenceItems.length)} />
          <Summary label="Approved for use" value="0" />
          <Summary label="Awaiting review" value={String(evidenceItems.length)} />
        </div>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Target role strategy</h2>
            <p className="section-subtitle">Leadership first. ServiceNow remains the platform—not your entire identity.</p>
          </div>
          <span className="meta-pill">100% search allocation</span>
        </div>

        <div className="strategy-grid">
          {careerProfile.targetLanes.map((lane, index) => (
            <article key={lane.name} className="strategy-card">
              <span className="strategy-number">0{index + 1}</span>
              <h3>{lane.name}</h3>
              <footer><span>Priority lane</span><strong>{lane.weight}%</strong></footer>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Evidence awaiting approval</h2>
            <p className="section-subtitle">Review each claim before Sartho uses it for matching or application content.</p>
          </div>
          <span className="status-chip status-pending">{evidenceItems.length} pending</span>
        </div>

        <div className="evidence-toolbar" aria-label="Evidence filters">
          <div className="toolbar-group">
            <button type="button" className="toolbar-pill is-active">All evidence</button>
            <button type="button" className="toolbar-pill">EUC & ITSM</button>
            <button type="button" className="toolbar-pill">ServiceNow</button>
            <button type="button" className="toolbar-pill">Leadership</button>
          </div>
          <span className="meta-pill">Newest first</span>
        </div>

        <div className="evidence-list">
          {evidenceItems.map((item) => (
            <article key={item.id} className="evidence-card">
              <div className="evidence-meta">
                <div className="evidence-employer">{item.employer} · {item.role}</div>
                <span className="status-chip status-pending">Needs approval</span>
              </div>
              <p className="evidence-claim">{item.claim}</p>
              {item.metrics.length ? <div className="evidence-metrics">{item.metrics.join(" · ")}</div> : null}
              <div className="chip-row">
                {item.domains.map((domain) => <span key={domain} className="domain-chip">{domain}</span>)}
              </div>
              <footer className="evidence-footer">
                <span className="evidence-source">Source: {item.source} · {item.sourceLocator}</span>
                <div className="review-actions" title="Approval actions are enabled in the next functional milestone">
                  <button type="button" className="review-button" disabled>Approve</button>
                  <button type="button" className="review-button" disabled>Edit</button>
                  <button type="button" className="review-button" disabled>Reject</button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}
