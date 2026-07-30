import Link from "next/link";
import { careerProfile, evidenceItems } from "@/data/profile";

const actions = [
  {
    href: "/career-truth",
    symbol: "✓",
    label: "Evidence to review",
    value: String(evidenceItems.length),
    note: "Confirm what Sartho may use",
    action: "Review Career Profile",
    tour: "career-profile",
  },
  {
    href: "/jobs",
    symbol: "✦",
    label: "Analyse a role",
    value: "New",
    note: "Requirements, recruiter signals and fit",
    action: "Start role analysis",
    tour: "analyse-role",
  },
  {
    href: "/resume-studio",
    symbol: "R",
    label: "Résumé Studio",
    value: "Build",
    note: "Master, role-focused and job-specific versions",
    action: "Open Résumé Studio",
  },
  {
    href: "/interview-prep",
    symbol: "Q",
    label: "Interview Prep",
    value: "Prepare",
    note: "Likely questions and evidence-backed answers",
    action: "Start preparation",
  },
  {
    href: "/applications",
    symbol: "↗",
    label: "Application journey",
    value: "0",
    note: "Track messages, interviews and outcomes",
    action: "Open applications",
    tour: "applications",
  },
];

export default function HomePage() {
  return (
    <div className="page-stack">
      <section className="hero-panel home-hero glass-card">
        <div className="hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Sartho AI · Your career, intelligently guided.</div>
          <h1>Find it. Prepare for it.<br />Land it.</h1>
          <p>
            Sartho helps you discover work worthy of your experience, prove why you belong,
            shape the right résumé and walk into every opportunity ready.
          </p>
          <div className="hero-actions">
            <Link href="/jobs" className="primary-button" data-tour="analyse-role">Analyse a role <span aria-hidden="true">↗</span></Link>
            <Link href="/welcome?replay=1" className="secondary-button">Play product tour</Link>
          </div>
        </div>

        <div className="home-hero-signal" aria-label={`${evidenceItems.length} career evidence items awaiting review`}>
          <span className="signal-label">Your next chapter</span>
          <strong>One right role can change everything.</strong>
          <p>{evidenceItems.length} career evidence records are ready to strengthen your next application.</p>
          <Link href="/career-truth">Build my Career Profile <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="metric-grid action-metric-grid" aria-label="Your Sartho journey">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="glass-card-soft metric-card action-metric" data-tour={action.tour}>
            <span className="metric-icon" aria-hidden="true">{action.symbol}</span>
            <div className="metric-label">{action.label}</div>
            <div className="metric-value">{action.value}</div>
            <div className="metric-note">{action.note}</div>
            <span className="metric-action">{action.action}<span aria-hidden="true">→</span></span>
          </Link>
        ))}
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

        <article className="glass-card content-card next-card action-next-card">
          <div className="page-eyebrow">Next best action</div>
          <h3>Analyse the NTT Transition & Transformation role</h3>
          <p>Use the first real recruiter-led opportunity to test Sartho’s match reasoning, résumé direction and interview preparation journey.</p>
          <div className="impact-row"><span>Impact</span><strong>Creates the first complete role journey</strong></div>
          <div className="impact-row"><span>Then</span><strong>Résumé Studio and Interview Prep</strong></div>
          <div className="next-action-buttons">
            <Link href="/jobs" className="primary-button">Start analysis <span aria-hidden="true">→</span></Link>
            <details className="why-details">
              <summary>Why this?</summary>
              <p>This role arrived through a real recruiter redirect and strongly matches your transition, EUC, infrastructure, ITSM and operational-handover experience. It is the right first case for the complete Sartho workflow.</p>
            </details>
          </div>
        </article>
      </section>
    </div>
  );
}
