import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getHomeJourneyState } from "@/lib/dashboard/home-state";
import { loadProductJourney } from "@/lib/journey/load-product-journey";
import type { JobStatus } from "@/lib/types";
import { withJwtClockSkewRetry } from "@/lib/supabase/retry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const { journey, workspace } = await loadProductJourney(supabase, user.id);
  const { profile, lanes, evidence } = workspace;

  /*
   * The Dashboard is the reward after onboarding, not the onboarding itself.
   * Until Sartho has a résumé, career context, user-selected strengths, a
   * weighted role strategy and approved evidence, the production entry point
   * must resume the Journey at the first unfinished step.
   */
  const approvedEvidence = evidence.filter((item) => item.approval_status === "approved").length;
  const pendingEvidence = evidence.filter((item) => item.approval_status === "pending").length;

  if (!journey.activated) redirect("/journey");

  const { data: jobs, error: jobsError } = await withJwtClockSkewRetry(() =>
    supabase
      .from("jobs")
      .select("id,status")
      .eq("user_id", user.id),
    (result) => result.error,
  );

  if (jobsError) throw jobsError;

  const jobRows = (jobs ?? []) as Array<{ id: string; status: JobStatus }>;
  const activeApplications = jobRows.filter((job) => !["offer", "rejected", "withdrawn"].includes(job.status)).length;
  const interviewCount = jobRows.filter((job) => job.status === "interview" || job.status === "assessment").length;
  const journeyState = getHomeJourneyState({ approvedEvidence, pendingEvidence });

  const actions = [
    {
      href: "/career-truth",
      symbol: "✓",
      label: "Evidence to review",
      value: String(pendingEvidence),
      note: pendingEvidence ? "Confirm what Sartho may use" : "Your approved evidence base is ready",
      action: pendingEvidence ? "Review Career Profile" : "Open Career Profile",
    },
    {
      href: "/jobs",
      symbol: "✦",
      label: "Saved opportunities",
      value: String(jobRows.length),
      note: "Analyse, save and revisit roles",
      action: "Open opportunities",
    },
    {
      href: "/resume-studio",
      symbol: "R",
      label: "Résumé Studio",
      value: approvedEvidence ? "Ready" : "Setup",
      note: approvedEvidence ? `${approvedEvidence} approved evidence records available` : "Approve evidence before tailoring",
      action: "Open Résumé Studio",
    },
    {
      href: "/interview-prep",
      symbol: "Q",
      label: "Interview Prep",
      value: String(interviewCount),
      note: interviewCount ? "Opportunities need preparation" : "Prepare from a saved role",
      action: "Start preparation",
    },
    {
      href: "/applications",
      symbol: "↗",
      label: "Active journey",
      value: String(activeApplications),
      note: "Track applications, interviews and outcomes",
      action: "Open applications",
    },
  ];

  return (
    <div className="page-stack">
      <section className="hero-panel home-hero glass-card">
        <div className="hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Sartho AI · Your career, intelligently guided.</div>
          <h1>See the opportunity.<br />Make the right move.</h1>
          <p>
            Sartho connects your search strategy, approved evidence and opportunity decisions—then helps you prepare an honest application and walk in ready.
          </p>
          <div className="hero-actions">
            <Link href={journeyState.primaryAction.href} className="primary-button">
              {journeyState.primaryAction.label} <span aria-hidden="true">→</span>
            </Link>
            <Link href="/?tour=1" className="secondary-button">Replay welcome</Link>
          </div>
        </div>

        <div className="home-hero-signal" aria-label="Career workspace readiness">
          <span className="signal-label">{journeyState.readiness.label}</span>
          <strong>{journeyState.readiness.title}</strong>
          <p>{journeyState.readiness.description}</p>
          <Link href={journeyState.readiness.href}>{journeyState.readiness.action} <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="metric-grid action-metric-grid" aria-label="Your Sartho journey">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="glass-card-soft metric-card action-metric">
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
              <h2 className="position-title">{profile?.headline ?? "Build your evidence-backed career positioning"}</h2>
            </div>
            <span className="meta-pill">
              {profile?.total_experience_years ? `${profile.total_experience_years}+ years` : journeyState.profileMetaFallback}
              {profile?.location ? ` · ${profile.location}` : ""}
            </span>
          </div>

          {lanes.length ? (
            <div className="lane-list">
              {lanes.map((lane, index) => (
                <div key={lane.id} className="lane-row">
                  <div className="lane-top">
                    <span className="lane-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="lane-name">{lane.name}</span>
                    <span className="lane-weight">{lane.weight}%</span>
                  </div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${lane.weight}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-inline-state">{journeyState.positioningFallback}</div>
          )}
        </article>

        <article className="glass-card content-card next-card action-next-card">
          <div className="page-eyebrow">Next best action</div>
          <h3>{pendingEvidence ? `Verify ${Math.min(pendingEvidence, 3)} career evidence records` : "Analyse the next promising role"}</h3>
          <p>
            {pendingEvidence
              ? "Approved evidence is the foundation for accurate job matching, truthful résumé tailoring and confident interview answers."
              : "Paste a complete job description, understand the opportunity and preserve the analysis in your private workspace."}
          </p>
          <div className="impact-row"><span>Impact</span><strong>{pendingEvidence ? "Unlocks evidence-led AI" : "Creates a complete opportunity journey"}</strong></div>
          <div className="impact-row"><span>Estimated effort</span><strong>{pendingEvidence ? "3–5 minutes" : "2 minutes"}</strong></div>
          <div className="next-action-buttons">
            <Link href={pendingEvidence ? "/career-truth" : "/jobs"} className="primary-button">
              {pendingEvidence ? "Review evidence" : "Start analysis"} <span aria-hidden="true">→</span>
            </Link>
            <details className="why-details">
              <summary>Why this?</summary>
              <p>Sartho can only make strong recommendations and drafts when its evidence base is both relevant and explicitly approved by you.</p>
            </details>
          </div>
        </article>
      </section>
    </div>
  );
}
