import Link from "next/link";

const preparationAreas = [
  {
    title: "Likely questions",
    description: "Turn the job description into the leadership, delivery, commercial and role-specific questions you are most likely to face.",
  },
  {
    title: "Your strongest stories",
    description: "Select the most relevant evidence from your career and shape it into clear STAR answers with real outcomes and metrics.",
  },
  {
    title: "Recruiter lens",
    description: "Understand what the interviewer may be testing beneath the words: seniority, ownership, judgment, influence and readiness.",
  },
  {
    title: "Follow-up pressure",
    description: "Prepare for the second question, the challenge question and the details that expose vague or unsupported answers.",
  },
];

export default function InterviewPrepPage() {
  return (
    <div className="page-stack">
      <section className="hero-panel glass-card">
        <div className="hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Interview Prep</div>
          <h1>Be ready when<br />the moment arrives.</h1>
          <p>
            Sartho connects the role, the recruiter’s likely priorities and your strongest real career stories—so your answers sound credible, relevant and unmistakably yours.
          </p>
          <div className="hero-actions">
            <Link href="/jobs" className="primary-button">Choose a role <span aria-hidden="true">↗</span></Link>
            <Link href="/career-truth" className="secondary-button">Review my evidence</Link>
          </div>
        </div>

        <div className="home-hero-signal" aria-label="Interview preparation principle">
          <span className="signal-label">Preparation principle</span>
          <strong>Do not memorise a script. Own your story.</strong>
          <p>Strong preparation gives you structure, proof and confidence without making the answer sound artificial.</p>
        </div>
      </section>

      <section className="metric-grid action-metric-grid" aria-label="Interview preparation areas">
        {preparationAreas.map((area, index) => (
          <article key={area.title} className="glass-card-soft metric-card action-metric">
            <span className="metric-icon" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div className="metric-label">{area.title}</div>
            <div className="metric-note">{area.description}</div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="glass-card content-card">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Answer architecture</div>
              <h2 className="position-title">A clear answer, built from real evidence.</h2>
            </div>
            <span className="meta-pill">Role-specific</span>
          </div>

          <div className="lane-list">
            {[
              ["Open with the point", "Answer the question directly before adding context."],
              ["Use the right career story", "Choose the example that best proves the capability the interviewer is testing."],
              ["Show your decisions", "Explain what you owned, how you judged the situation and what you changed."],
              ["Land the outcome", "Close with a measurable result, learning or business impact."],
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
          <div className="page-eyebrow">Start with a real opportunity</div>
          <h3>Interview preparation begins after the role is understood.</h3>
          <p>
            Analyse the job first. Sartho will then use the requirements, likely recruiter signals and your approved evidence to build the preparation pack.
          </p>
          <div className="impact-row"><span>Output</span><strong>Questions, answer guidance and follow-ups</strong></div>
          <div className="impact-row"><span>Grounding</span><strong>Your approved career evidence</strong></div>
          <Link href="/jobs" className="primary-button">Analyse a role <span aria-hidden="true">→</span></Link>
        </article>
      </section>
    </div>
  );
}
