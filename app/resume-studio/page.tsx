import Link from "next/link";

const versionTypes = [
  {
    title: "Master résumé",
    state: "Protected source",
    description: "Your complete career record. Sartho will never overwrite this version when tailoring for a role.",
    action: "Review Career Profile",
    href: "/career-truth",
  },
  {
    title: "Role-positioning versions",
    state: "Ready to configure",
    description: "Create focused versions for Transition & Transformation, EUC & Digital Workplace, and ServiceNow delivery leadership.",
    action: "Set role direction",
    href: "/career-truth",
  },
  {
    title: "Job-specific versions",
    state: "Starts with an analysis",
    description: "Every analysed role can create a separate evidence-backed résumé delta without changing your master résumé.",
    action: "Analyse a role",
    href: "/jobs",
  },
];

export default function ResumeStudioPage() {
  return (
    <div className="page-stack">
      <section className="hero-panel glass-card">
        <div className="hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Résumé Studio</div>
          <h1>Shape the résumé<br />the role deserves.</h1>
          <p>
            Keep one protected master résumé, create focused career-positioning versions and produce a role-specific version that highlights the evidence recruiters need to see.
          </p>
          <div className="hero-actions">
            <Link href="/jobs" className="primary-button">Analyse a role <span aria-hidden="true">↗</span></Link>
            <Link href="/career-truth" className="secondary-button">Strengthen Career Profile</Link>
          </div>
        </div>

        <div className="home-hero-signal" aria-label="Résumé Studio readiness">
          <span className="signal-label">Résumé principle</span>
          <strong>Tailor the story. Never invent it.</strong>
          <p>Every suggested change must be connected to verified career evidence and approved by you.</p>
        </div>
      </section>

      <section className="metric-grid action-metric-grid" aria-label="Résumé version types">
        {versionTypes.map((item, index) => (
          <Link key={item.title} href={item.href} className="glass-card-soft metric-card action-metric">
            <span className="metric-icon" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div className="metric-label">{item.title}</div>
            <div className="metric-value">{item.state}</div>
            <div className="metric-note">{item.description}</div>
            <span className="metric-action">{item.action}<span aria-hidden="true">→</span></span>
          </Link>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="glass-card content-card">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Résumé Delta</div>
              <h2 className="position-title">See exactly what should change—and why.</h2>
            </div>
            <span className="meta-pill">Human approval required</span>
          </div>

          <div className="lane-list">
            {[
              ["Emphasise", "Bring the most relevant achievements and outcomes higher."],
              ["Reframe", "Use language that matches the role while preserving the truth."],
              ["De-emphasise", "Reduce details that make your profile look too technical, narrow or operational."],
              ["Verify", "Flag claims that need your confirmation before they can be used."],
            ].map(([title, description], index) => (
              <div className="lane-row" key={title}>
                <div className="lane-top">
                  <span className="lane-index">0{index + 1}</span>
                  <span className="lane-name">{title}</span>
                </div>
                <p className="metric-note">{description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card content-card next-card action-next-card">
          <div className="page-eyebrow">Download readiness</div>
          <h3>Downloads will follow the secure data migration.</h3>
          <p>
            Word and PDF downloads become reliable only after the master résumé and approved evidence are stored in Supabase instead of the source code.
          </p>
          <div className="impact-row"><span>Planned formats</span><strong>ATS-safe Word and PDF</strong></div>
          <div className="impact-row"><span>Protection</span><strong>Master résumé never overwritten</strong></div>
          <Link href="/career-truth" className="primary-button">Prepare the evidence <span aria-hidden="true">→</span></Link>
        </article>
      </section>
    </div>
  );
}
