import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getJobs } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

const preparationAreas = [
  {
    title: "Likely questions",
    description: "Use the saved requirements and recruiter signals to focus on the questions most likely to test leadership, delivery and judgment.",
  },
  {
    title: "Your strongest stories",
    description: "Choose approved evidence that proves the required capability and shape it into a concise STAR answer.",
  },
  {
    title: "Recruiter lens",
    description: "Separate written requirements from clearly labelled AI inference about seniority, ownership, influence and readiness.",
  },
  {
    title: "Follow-up pressure",
    description: "Prepare the second question, the challenge question and the details that expose unsupported answers.",
  },
];

export default async function InterviewPrepPage() {
  const { supabase, user } = await requireUser();
  const jobs = await getJobs(supabase, user.id);
  const readyJobs = jobs.filter((job) => job.deep_analysis_status === "complete");
  const activeInterviews = jobs.filter((job) => job.status === "interview" || job.status === "assessment");

  return (
    <div className="page-stack">
      <section className="hero-panel glass-card">
        <div className="hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Interview Prep</div>
          <h1>Be ready when<br />the moment arrives.</h1>
          <p>Sartho connects a real opportunity, the recruiter’s likely priorities and your strongest approved career stories—so your answers are relevant, credible and unmistakably yours.</p>
          <div className="hero-actions">
            <Link href="/jobs" className="primary-button">Choose a role <span aria-hidden="true">↗</span></Link>
            <Link href="/career-truth" className="secondary-button">Review my evidence</Link>
          </div>
        </div>

        <div className="home-hero-signal" aria-label="Interview preparation readiness">
          <span className="signal-label">Preparation principle</span>
          <strong>Do not memorise a script. Own your story.</strong>
          <p>{readyJobs.length} roles have completed evidence-led analysis; {activeInterviews.length} currently need assessment or interview attention.</p>
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

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Roles ready for preparation</h2>
            <p className="section-subtitle">Open a role to review its requirement mapping, evidence citations, recruiter lens and résumé draft together.</p>
          </div>
          <span className="meta-pill">{readyJobs.length} ready</span>
        </div>

        {readyJobs.length ? (
          <div className="saved-job-list">
            {readyJobs.map((job) => (
              <Link href={`/jobs/${job.id}`} className="saved-job-row" key={job.id}>
                <div>
                  <span className="saved-job-employer">{job.employer ?? "Employer not recorded"}</span>
                  <strong>{job.title}</strong>
                  <small>{job.deep_analysis_summary?.mandatoryMet ?? 0} of {job.deep_analysis_summary?.mandatoryTotal ?? 0} mandatory requirements supported</small>
                </div>
                <div className="saved-job-signals">
                  <span className={`status-chip status-${job.status}`}>{job.status}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-ledger-inner">
            <div className="empty-ledger-icon" aria-hidden="true">Q</div>
            <h3>No role is ready for evidence-backed preparation yet</h3>
            <p>Save a job and complete deep analysis. That requirement mapping becomes the foundation for role-specific interview preparation.</p>
            <Link href="/jobs" className="primary-button">Analyse a role <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      <section className="dashboard-grid">
        <article className="glass-card content-card">
          <div className="card-header">
            <div><div className="page-eyebrow">Answer architecture</div><h2 className="position-title">A clear answer, built from real evidence.</h2></div>
            <span className="meta-pill">Role-specific</span>
          </div>
          <div className="lane-list">
            {[
              ["Open with the point", "Answer the question directly before adding context."],
              ["Use the right career story", "Choose approved evidence that proves the capability being tested."],
              ["Show your decisions", "Explain what you owned, how you judged the situation and what you changed."],
              ["Land the outcome", "Close with a supported result, learning or business impact."],
            ].map(([title, description], index) => (
              <div className="lane-row" key={title}>
                <div className="lane-top"><span className="lane-index">{String(index + 1).padStart(2, "0")}</span><span className="lane-name">{title}</span></div>
                <p className="metric-note">{description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card content-card next-card action-next-card">
          <div className="page-eyebrow">Trust boundary</div>
          <h3>Preparation guides you; it does not manufacture a persona.</h3>
          <p>Every story, metric and claimed capability must remain grounded in approved evidence. Unknowns remain honest gaps.</p>
          <div className="impact-row"><span>Output</span><strong>Question themes, evidence and follow-up preparation</strong></div>
          <div className="impact-row"><span>Control</span><strong>You decide what to say and how to say it</strong></div>
          <Link href="/career-truth" className="primary-button">Strengthen my evidence <span aria-hidden="true">→</span></Link>
        </article>
      </section>
    </div>
  );
}
