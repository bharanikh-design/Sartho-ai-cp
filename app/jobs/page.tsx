import { JobAnalyser } from "@/components/job-analyser";

export default function JobsPage() {
  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Decision engine</div>
        <h1 className="page-title">Analyse a Job</h1>
        <p className="page-description">
          Understand the role before spending time on it. Sartho weighs career-lane fit, seniority and technical
          heaviness—then explains whether the opportunity deserves an application.
        </p>
      </section>
      <JobAnalyser />
    </div>
  );
}
