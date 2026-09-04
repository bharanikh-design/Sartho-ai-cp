import Link from "next/link";
import { ProductPageHeader, ProductSectionHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getJobs } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

export default async function InterviewPrepPage() {
  const { supabase, user } = await requireUser();
  const jobs = await getJobs(supabase, user.id);
  const readyJobs = jobs.filter((job) => job.deep_analysis_status === "complete");
  const activeInterviews = jobs.filter((job) => job.status === "interview" || job.status === "assessment");
  const orderedJobs = [...readyJobs].sort((left, right) => {
    const leftActive = activeInterviews.some((job) => job.id === left.id) ? 1 : 0;
    const rightActive = activeInterviews.some((job) => job.id === right.id) ? 1 : 0;
    return rightActive - leftActive;
  });

  return (
    <div className="page-stack">
      <ProductPageHeader
        eyebrow="Prepare · Interview"
        title="Prepare from the role and the evidence—not from generic scripts."
        description="Choose an analysed opportunity to review its requirements, recruiter signals and the approved career stories that support your answers."
        metric={{ value: activeInterviews.length, label: "roles need attention" }}
        actions={[{ href: "/applications#add-role", label: "Choose or analyse a role", primary: !readyJobs.length }]}
      />

      <div className="capability-note">
        <strong>Available now · grounded AI interview coaching</strong>
        <span>Open an analysed role to generate role-specific questions, a natural answer plan, approved evidence to use and warnings about where you could overclaim.</span>
      </div>

      <section className="glass-card content-card">
        <ProductSectionHeader
          eyebrow="Start with the role"
          title="Choose an opportunity to prepare for"
          description="Roles at assessment or interview stage appear first. Open one to see the evidence and gaps that should shape your preparation."
          aside={`${readyJobs.length} ready`}
        />

        {orderedJobs.length ? (
          <div className="saved-job-list" style={{ marginTop: 24 }}>
            {orderedJobs.map((job) => {
              const needsAttention = job.status === "interview" || job.status === "assessment";
              return (
                <Link href={`/jobs/${job.id}#interview-coach`} className="saved-job-row" key={job.id}>
                  <div>
                    <span className="saved-job-employer">{needsAttention ? "Needs preparation" : job.employer ?? "Employer not recorded"}</span>
                    <strong>{job.title}</strong>
                    <small>{job.deep_analysis_summary?.mandatoryMet ?? 0} of {job.deep_analysis_summary?.mandatoryTotal ?? 0} mandatory requirements supported{needsAttention ? ` · ${job.employer ?? "Employer not recorded"}` : ""}</small>
                  </div>
                  <div className="saved-job-signals">
                    <span className={`status-chip status-${job.status}`}>{job.status}</span>
                    <span aria-hidden="true">Review →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-ledger-inner">
            <div className="empty-ledger-icon" aria-hidden="true">1</div>
            <h3>Analyse one real role first</h3>
            <p>Interview preparation needs the role requirements and your confirmed evidence. Add a job, save it and complete the Career Profile match.</p>
            <Link href="/applications#add-role" className="primary-button">Analyse a role <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      <section className="glass-card content-card">
        <ProductSectionHeader
          eyebrow="Preparation method"
          title="A simple four-part answer check"
          description="Use this structure while reviewing the requirement mapping for a selected role."
        />
        <div className="strategy-grid" style={{ marginTop: 24 }}>
          {[
            ["Answer", "Respond to the question directly before adding context."],
            ["Evidence", "Choose one approved career story that proves the capability."],
            ["Judgment", "Explain what you owned, decided and changed."],
            ["Outcome", "Close with a supported result, learning or business impact."],
          ].map(([title, description], index) => (
            <article className="strategy-card" key={title}>
              <span className="strategy-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p className="section-subtitle">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
