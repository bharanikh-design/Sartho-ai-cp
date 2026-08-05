import Link from "next/link";
import { ResumeImport } from "@/components/resume-import";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const { profile, lanes, evidence } = await getCareerWorkspace(supabase, user.id);
  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id,status")
    .eq("user_id", user.id);

  if (jobsError) throw jobsError;

  const approvedEvidence = evidence.filter((item) => item.approval_status === "approved").length;
  const pendingEvidence = evidence.filter((item) => item.approval_status === "pending").length;
  const jobRows = (jobs ?? []) as Array<{ id: string; status: JobStatus }>;
  const activeApplications = jobRows.filter((job) => !["offer", "rejected", "withdrawn"].includes(job.status)).length;
  const interviewCount = jobRows.filter((job) => job.status === "interview" || job.status === "assessment").length;

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
      action: "Open role workspace",
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

  /*
   * A brand-new account has no evidence, and every tile below reads zero. The
   * dashboard is meaningless until a career is in, so the first screen after
   * signing in should point at the one thing that matters rather than at five
   * empty counters.
   *
   * And it points at it by doing it. This spot previously held a button reading
   * "Upload your résumé" that only navigated to a page carrying an identical
   * button — the second of which was the real one. A control that names an
   * action has to perform it, so the uploader itself stands here now.
   */
  if (!evidence.length) {
    return (
      <div className="page-stack">
        <section className="hero-panel home-hero glass-card">
          <div className="hero-copy">
            <div className="page-eyebrow"><span className="live-dot" /> First step</div>
            <h1>Start with<br />your résumé.</h1>
            <p>
              Sartho reads it and records every role and achievement it finds — as claims for
              you to approve, never as facts it decided on your behalf. Nothing reaches a
              match, a résumé or an interview answer until you have said yes to it.
            </p>
            <div className="hero-upload">
              <ResumeImport hasEvidence={false} showLead={false} continueHref="/career-truth" />
            </div>

            {/*
              * The welcome tour is dismissible and stays dismissed, and this
              * screen — the one a brand-new account actually lands on — had no
              * way back to it. The dashboard below carries the same link.
              */}
            <p className="hero-replay">
              <Link href="/?tour=1">Replay the welcome tour <span aria-hidden="true">→</span></Link>
            </p>
          </div>

          <div className="home-hero-signal" aria-label="Why this comes first">
            <span className="signal-label">Why this first</span>
            <strong>A headhunter who knows you has to know you.</strong>
            <p>
              Matching, résumé tailoring and interview preparation all read from your approved
              evidence. Until it exists, there is nothing honest to match against.
            </p>
          </div>
        </section>
      </div>
    );
  }

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
            <Link href="/jobs" className="primary-button">Analyse a role <span aria-hidden="true">↗</span></Link>
            <Link href="/?tour=1" className="secondary-button">Replay welcome</Link>
          </div>
        </div>

        <div className="home-hero-signal" aria-label="Career workspace readiness">
          <span className="signal-label">Your next chapter</span>
          <strong>One right role can change everything.</strong>
          <p>
            {profile
              ? `${approvedEvidence} approved evidence records can support honest matching and preparation.`
              : "Load your private Career Profile to begin evidence-backed matching."}
          </p>
          <Link href="/career-truth">{profile ? "Strengthen my Career Profile" : "Set up my Career Profile"} <span aria-hidden="true">→</span></Link>
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
              {profile?.total_experience_years ? `${profile.total_experience_years}+ years` : "Private profile"}
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
            <div className="empty-inline-state">Your target role lanes will appear here after the Career Profile is loaded.</div>
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
