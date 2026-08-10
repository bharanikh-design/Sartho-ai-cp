import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { summarizeDashboardJobs } from "@/lib/dashboard/job-metrics";
import { loadProductJourney } from "@/lib/journey/load-product-journey";
import type { JobRecommendation, JobStatus } from "@/lib/types";
import { withJwtClockSkewRetry } from "@/lib/supabase/retry";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const { journey, workspace } = await loadProductJourney(supabase, user.id);
  const approvedEvidence = workspace.evidence.filter((item) => item.approval_status === "approved").length;
  const pendingEvidence = workspace.evidence.filter((item) => item.approval_status === "pending").length;

  const { data: jobs, error: jobsError } = await withJwtClockSkewRetry(() =>
    supabase
      .from("jobs")
      .select("id,status,recommendation")
      .eq("user_id", user.id),
    (result) => result.error,
  );
  if (jobsError) throw jobsError;

  const jobRows = (jobs ?? []) as Array<{ id: string; status: JobStatus; recommendation: JobRecommendation | null }>;
  const { activeApplications, interviewCount, outcomeCount, strongMatches } = summarizeDashboardJobs(jobRows);
  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "there").split(" ")[0];

  const nextAction = !journey.activated
    ? {
        eyebrow: `Foundation · Step ${journey.currentIndex + 1} of ${journey.steps.length}`,
        title: journey.current.title,
        description: journey.current.description,
        href: journey.current.href,
        label: "Continue foundation",
      }
    : interviewCount > 0
      ? {
          eyebrow: "Needs attention",
          title: `Prepare for ${interviewCount === 1 ? "your active interview" : `${interviewCount} active interviews`}`,
          description: "Review the role requirements and the approved career evidence that should shape your answers.",
          href: "/interview-prep",
          label: "Open interview preparation",
        }
      : {
          eyebrow: "Next best action",
          title: jobRows.length ? "Review your saved opportunities" : "Analyse your first promising role",
          description: jobRows.length
            ? "Compare the saved roles and decide which one deserves attention next."
            : "Add a real job description and compare it with your confirmed Career Profile.",
          href: "/jobs",
          label: jobRows.length ? "Review opportunities" : "Analyse a role",
        };

  const workflow = [
    {
      label: "Career foundation",
      value: journey.activated ? "Complete" : `${journey.progress}%`,
      detail: journey.activated ? `${approvedEvidence} approved career facts` : `Next: ${journey.current.label}`,
      href: journey.activated ? "/career-truth" : journey.current.href,
      state: journey.activated ? "complete" : "current",
    },
    {
      label: "Opportunities",
      value: String(jobRows.length),
      detail: jobRows.length ? `${strongMatches} strong match${strongMatches === 1 ? "" : "es"}` : "No roles analysed yet",
      href: "/jobs",
      state: jobRows.length ? "active" : "pending",
    },
    {
      label: "Applications",
      value: String(activeApplications),
      detail: interviewCount ? `${interviewCount} at assessment or interview` : "No interview action due",
      href: "/applications",
      state: activeApplications ? "active" : "pending",
    },
    {
      label: "Outcomes",
      value: String(outcomeCount),
      detail: outcomeCount ? "Offers, rejections or withdrawals recorded" : "No outcomes recorded yet",
      href: "/applications",
      state: outcomeCount ? "complete" : "pending",
    },
  ];

  return (
    <div className="page-stack dashboard-page">
      <ProductPageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${firstName}.`}
        description="See where you are, what needs attention and the one action that moves your career workflow forward."
        metric={{ value: `${journey.progress}%`, label: "foundation complete" }}
      />

      <section className="dashboard-workflow" aria-labelledby="dashboard-workflow-title">
        <div className="dashboard-section-heading">
          <div><p className="product-system-eyebrow">Your workflow</p><h2 id="dashboard-workflow-title">From profile to outcome</h2></div>
          {pendingEvidence ? <span>{pendingEvidence} profile item{pendingEvidence === 1 ? "" : "s"} need review</span> : null}
        </div>
        <div className="dashboard-stage-grid">
          {workflow.map((stage, index) => (
            <Link className={`dashboard-stage is-${stage.state}`} href={stage.href} key={stage.label}>
              <span className="dashboard-stage-number">{index + 1}</span>
              <small>{stage.label}</small>
              <strong>{stage.value}</strong>
              <p>{stage.detail}</p>
              <b aria-hidden="true">→</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-next-action" aria-labelledby="dashboard-next-title">
        <div>
          <p className="product-system-eyebrow">{nextAction.eyebrow}</p>
          <h2 id="dashboard-next-title">{nextAction.title}</h2>
          <p>{nextAction.description}</p>
        </div>
        <Link href={nextAction.href} className="primary-button">{nextAction.label} <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
