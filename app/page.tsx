import Link from "next/link";
import type { CSSProperties } from "react";
import { careerProfile, evidenceItems } from "@/data/profile";

const flow = [
  ["Career Truth", "Verify the experience Sartho may use."],
  ["Role Intelligence", "Read the role beyond keyword matching."],
  ["Application", "Create an honest, targeted application."],
  ["Outcome", "Track every response and next action."],
];

export default function HomePage() {
  return (
    <div className="page-stack">
      <section className="hero-panel glass-card">
        <div className="hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Evidence-led career intelligence</div>
          <h1>Find work worthy of your experience.</h1>
          <p>
            Sartho turns your verified career evidence into focused job discovery, honest fit analysis,
            tailored applications and one clear view of every outcome.
          </p>
          <div className="hero-actions">
            <Link href="/jobs" className="primary-button">Analyse a job <span aria-hidden="true">↗</span></Link>
            <Link href="/career-truth" className="secondary-button">Review Career Truth</Link>
          </div>
        </div>

        <div className="hero-focus" aria-label={`${evidenceItems.length} career evidence items awaiting review`}>
          <div className="focus-orbit">
            <span className="orbit-label orbit-label-one">Human approved</span>
            <span className="orbit-label orbit-label-two">Evidence first</span>
            <div className="focus-core"><strong>{evidenceItems.length}</strong><span>truth items</span></div>
          </div>
        </div>
      </section>

      <section className="metric-grid" aria-label="Workspace status">
        <Metric symbol="✓" label="Career evidence" value={String(evidenceItems.length)} note="Ready for your review" />
        <Metric symbol="◎" label="Target role lanes" value="3" note="Leadership positioning locked" />
        <Metric symbol="↗" label="Unattended submissions" value="0" note="You remain in control" />
      </section>

      <section className="dashboard-grid">
        <article className="glass-card content-card">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Current positioning</div>
              <h2 className="position-title">{careerProfile.headline}</h2>
            </div>
            <span className="meta-pill">{careerProfile.experienceYears}+ years · {careerProfile.location}</span>
          </div>

          <div className="lane-list">
            {careerProfile.targetLanes.map((lane, index) => (
              <div key={lane.name} className="lane-row">
                <div className="lane-top">
                  <span className="lane-index">0{index + 1}</span>
                  <span className="lane-name">{lane.name}</span>
                  <span className="lane-weight">{lane.weight}%</span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${lane.weight}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card content-card next-card">
          <div className="next-card-visual">
            <div className="progress-ring" style={{ "--progress": "0deg" } as CSSProperties}>
              <div className="progress-ring-content"><strong>0%</strong><span>approved</span></div>
            </div>
          </div>
          <div className="next-card-copy">
            <div className="page-eyebrow">Next best action</div>
            <h3>Confirm your career evidence</h3>
            <p>Review the first evidence records so future matching and résumé tailoring can be grounded in facts you trust.</p>
            <Link href="/career-truth" className="primary-button">Start review <span aria-hidden="true">→</span></Link>
          </div>
        </article>
      </section>

      <section className="glass-card flow-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">How Sartho works</h2>
            <p className="section-subtitle">One controlled path from experience to opportunity.</p>
          </div>
          <span className="meta-pill"><span className="live-dot" /> Foundation active</span>
        </div>
        <div className="flow-grid">
          {flow.map(([title, description], index) => (
            <div key={title} className={`flow-step${index === 0 ? " is-current" : ""}`}>
              <span className="flow-step-number">0{index + 1}</span>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ symbol, label, value, note }: { symbol: string; label: string; value: string; note: string }) {
  return (
    <article className="glass-card-soft metric-card">
      <span className="metric-icon" aria-hidden="true">{symbol}</span>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </article>
  );
}
