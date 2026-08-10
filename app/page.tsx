import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadProductJourney } from "@/lib/journey/load-product-journey";
import type { JobStatus } from "@/lib/types";
import { withJwtClockSkewRetry } from "@/lib/supabase/retry";

export const dynamic = "force-dynamic";

const activeApplicationStatuses = new Set<JobStatus>([
  "approved",
  "applied",
  "acknowledged",
  "assessment",
  "interview",
]);

export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const { journey, workspace } = await loadProductJourney(supabase, user.id);
  const { profile, lanes, evidence } = workspace;

  const approvedEvidence = evidence.filter((item) => item.approval_status === "approved").length;
  const pendingEvidence = evidence.filter((item) => item.approval_status === "pending").length;

  const { data: jobs, error: jobsError } = await withJwtClockSkewRetry(() =>
    supabase
      .from("jobs")
      .select("id,status")
      .eq("user_id", user.id),
    (result) => result.error,
  );

  if (jobsError) throw jobsError;

  const jobRows = (jobs ?? []) as Array<{ id: string; status: JobStatus }>;
  const activeApplications = jobRows.filter((job) => activeApplicationStatuses.has(job.status)).length;
  const interviewCount = jobRows.filter((job) => job.status === "interview" || job.status === "assessment").length;
  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "there").split(" ")[0];
  const hasPositioning = Boolean(profile?.headline?.trim() || lanes.length);

  const nextAction = !journey.activated
    ? {
        eyebrow: `Setup · Step ${journey.currentIndex + 1} of ${journey.steps.length}`,
        title: journey.current.title,
        description: journey.current.description,
        reason: journey.current.reason,
        href: journey.current.href,
        label: "Continue setup",
      }
    : interviewCount > 0
      ? {
          eyebrow: "Applications · Needs attention",
          title: `Prepare for ${interviewCount === 1 ? "your active interview" : `${interviewCount} active interviews`}`,
          description: "Turn the role requirements and your approved evidence into focused preparation before the next conversation.",
          reason: "Preparation is most useful while the opportunity and your evidence are fresh.",
          href: "/interview-prep",
          label: "Open interview preparation",
        }
      : {
          eyebrow: "Opportunities · Next move",
          title: jobRows.length ? "Review your opportunities" : "Analyse your first promising role",
          description: jobRows.length
            ? "Return to saved roles, compare their fit and decide which opportunity deserves your attention next."
            : "Paste a complete job description and Sartho will compare it with the career evidence you have approved.",
          reason: "Every opportunity decision stays connected to your Career Profile and application history.",
          href: "/jobs",
          label: jobRows.length ? "Review opportunities" : "Analyse a role",
        };

  const summary = [
    {
      href: "/career-truth",
      label: "Career Profile",
      value: pendingEvidence ? "Review needed" : approvedEvidence ? "Confirmed" : "Not ready",
      detail: pendingEvidence
        ? `${pendingEvidence} item${pendingEvidence === 1 ? "" : "s"} still need your review`
        : approvedEvidence
          ? `${approvedEvidence} approved evidence item${approvedEvidence === 1 ? "" : "s"}`
          : "Add a résumé to build your evidence base",
    },
    {
      href: "/jobs",
      label: "Opportunities",
      value: String(jobRows.length),
      detail: jobRows.length ? "Saved roles in your workspace" : "No roles analysed yet",
    },
    {
      href: "/applications",
      label: "Active applications",
      value: String(activeApplications),
      detail: interviewCount ? `${interviewCount} at assessment or interview stage` : "Track progress and outcomes here",
    },
  ];

  return (
    <div className="page-stack home-dashboard">
      <header className="home-welcome">
        <div>
          <div className="page-eyebrow"><span className="live-dot" /> Your career workspace</div>
          <h1>Welcome back, {firstName}.</h1>
          <p>One clear path from Career Profile to opportunity, application and outcome.</p>
        </div>
        <Link href="/?tour=1" className="home-text-link">Replay introduction</Link>
      </header>

      <section className="glass-card home-primary-action" aria-labelledby="next-action-title">
        <div className="home-primary-copy">
          <span className="home-step-label">{nextAction.eyebrow}</span>
          <h2 id="next-action-title">{nextAction.title}</h2>
          <p>{nextAction.description}</p>
          <Link href={nextAction.href} className="primary-button">
            {nextAction.label} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <aside className="home-action-context">
          <span>{journey.activated ? "Why this is next" : "Your progress"}</span>
          {!journey.activated ? (
            <>
              <strong>{journey.completedSteps} of {journey.steps.length} complete</strong>
              <i aria-hidden="true"><b style={{ width: `${journey.progress}%` }} /></i>
            </>
          ) : null}
          <p>{nextAction.reason}</p>
        </aside>
      </section>

      {!journey.activated ? (
        <section className="home-journey" aria-labelledby="journey-title">
          <div className="home-section-heading">
            <div><span>Foundation</span><h2 id="journey-title">Your setup path</h2></div>
            <Link href="/journey">See full journey →</Link>
          </div>
          <ol className="home-journey-list">
            {journey.steps.map((step, index) => {
              const state = step.complete ? "complete" : index === journey.currentIndex ? "current" : "pending";
              return (
                <li className={`is-${state}`} key={step.id}>
                  <Link href={step.href} aria-current={state === "current" ? "step" : undefined}>
                    <span className="home-journey-marker" aria-hidden="true">{step.complete ? "✓" : index + 1}</span>
                    <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                    <em>{step.complete ? "Done" : state === "current" ? "Next" : "Later"}</em>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="home-summary" aria-label="Workspace summary">
        {summary.map((item) => (
          <Link href={item.href} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
            <b aria-hidden="true">→</b>
          </Link>
        ))}
      </section>

      <section className="glass-card home-positioning" aria-labelledby="positioning-title">
        <div className="home-section-heading">
          <div><span>Career direction</span><h2 id="positioning-title">Your positioning</h2></div>
          <Link href="/career-direction">{hasPositioning ? "Edit direction" : "Set direction"} →</Link>
        </div>

        {hasPositioning ? (
          <div className="home-positioning-content">
            <div className="home-positioning-copy">
              <strong>{profile?.headline || "Choose the roles you want Sartho to prioritise"}</strong>
              <p>
                {[profile?.location, profile?.total_experience_years ? `${profile.total_experience_years}+ years experience` : null]
                  .filter(Boolean)
                  .join(" · ") || "Your direction guides opportunity ranking and application preparation."}
              </p>
            </div>
            {lanes.length ? (
              <div className="home-lanes">
                {lanes.map((lane, index) => (
                  <div key={lane.id}>
                    <span>{index + 1}</span><strong>{lane.name}</strong><b>{lane.weight}%</b>
                    <i aria-hidden="true"><em style={{ width: `${lane.weight}%` }} /></i>
                  </div>
                ))}
              </div>
            ) : (
              <div className="home-positioning-prompt">
                <p>Add target profiles so Sartho knows which career directions matter most to you.</p>
                <Link href="/career-direction" className="secondary-button">Add target profiles</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="home-empty-action">
            <div>
              <strong>Tell Sartho where you want to go next.</strong>
              <p>Add your headline, location and target profiles. This turns a general Career Profile into a focused search direction.</p>
            </div>
            <Link href="/career-direction" className="secondary-button">Build my positioning <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      <section className="home-tools" aria-labelledby="tools-title">
        <div className="home-section-heading">
          <div><span>Supporting tools</span><h2 id="tools-title">Use these when the journey calls for them</h2></div>
        </div>
        <div>
          <Link href="/resume-studio">
            <span className="home-tool-icon" aria-hidden="true">R</span>
            <span><strong>Résumé Studio</strong><small>Create a tailored version after analysing an opportunity.</small></span>
            <b aria-hidden="true">→</b>
          </Link>
          <Link href="/interview-prep">
            <span className="home-tool-icon" aria-hidden="true">Q</span>
            <span><strong>Interview preparation</strong><small>Prepare from the requirements and evidence attached to a saved role.</small></span>
            <b aria-hidden="true">→</b>
          </Link>
        </div>
      </section>
    </div>
  );
}
