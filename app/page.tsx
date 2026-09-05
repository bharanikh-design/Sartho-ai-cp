import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { JourneyNudgeCard } from "@/components/journey-nudge-card";
import { ProfileScorecard } from "@/components/profile-scorecard";
import { ResumeImport } from "@/components/resume-import";
import { requireUser } from "@/lib/auth";
import {
  buildCareerCommandCentre,
  type CommandCentreApplication,
  type CommandCentreJob,
} from "@/lib/dashboard/command-centre";
import { loadProductJourney } from "@/lib/journey/load-product-journey";
import { withJwtClockSkewRetry } from "@/lib/supabase/retry";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const [journeyResult, jobsResult, applicationsResult] = await Promise.all([
    loadProductJourney(supabase, user.id),
    withJwtClockSkewRetry(
      () => supabase
        .from("jobs")
        .select("id,title,employer,status,recommendation,overall_match,rule_analysis,deep_analysis_status,deep_analysis_summary,updated_at")
        .eq("user_id", user.id),
      (result) => result.error,
    ),
    supabase
      .from("applications")
      .select("job_id,resume_draft,next_action,next_action_date")
      .eq("user_id", user.id),
  ]);

  if (jobsResult.error) throw jobsResult.error;
  if (applicationsResult.error) throw applicationsResult.error;

  const { journey, workspace } = journeyResult;
  const pendingSteps = journey.steps.filter((s) => !s.complete);
  const approvedEvidence = workspace.evidence.filter((item) => item.approval_status === "approved").length;
  const pendingEvidence = workspace.evidence.filter((item) => item.approval_status === "pending").length;
  const commandCentre = buildCareerCommandCentre({
    journey,
    jobs: (jobsResult.data ?? []) as CommandCentreJob[],
    applications: (applicationsResult.data ?? []) as CommandCentreApplication[],
    approvedEvidence,
    pendingEvidence,
  });
  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "there").split(" ")[0];

  /*
   * Everything Sartho does rests on approved evidence, so before a résumé
   * exists the dashboard is the upload and nothing else. Showing a pipeline, a
   * next-best-action and a résumé-tailoring workflow to someone with no data
   * is a room full of doors that all open onto empty.
   */
  const hasResume = journey.steps.find((step) => step.id === "resume")?.complete ?? false;
  if (!hasResume) {
    return (
      <div className="page-stack dashboard-page">
        <ProductPageHeader
          eyebrow="Welcome to Sartho"
          title={`Let's start with your résumé, ${firstName}.`}
          description="Everything Sartho does is grounded in evidence you approve. Upload one strong résumé and it reads every role and achievement into your career profile — no line-by-line confirmation."
        />

        <section className="glass-card content-card" id="resume">
          <div className="card-header">
            <div>
              <h2 className="section-heading">Upload your résumé</h2>
              <p className="section-subtitle">PDF, Word or plain text. Your document stays the source of truth, and nothing is shared without you.</p>
            </div>
            <span className="status-chip status-pending">Step 1 of 3</span>
          </div>
          <ResumeImport hasEvidence={false} continueHref="/career-direction" />
        </section>

        <section className="glass-card content-card">
          <div className="card-header">
            <div>
              <h2 className="section-heading">What happens next</h2>
              <p className="section-subtitle">Each step unlocks once the one before it is done.</p>
            </div>
          </div>
          <ol className="scorecard-steps">
            {journey.steps.map((step) => (
              <li key={step.id} className={step.id === "resume" ? "is-next" : ""}>
                <span aria-hidden="true">{step.id === "resume" ? "○" : "🔒"}</span>
                <div><strong>{step.title}</strong><small>{step.description}</small></div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack dashboard-page command-centre-page">
      <ProductPageHeader
        eyebrow="Career Command Centre"
        title={`Welcome back, ${firstName}.`}
        description="One connected view from Career Profile to outcome. Sartho uses your live workspace to explain what matters now and where to go next."
        metric={{ value: pendingSteps.length.toString(), label: pendingSteps.length === 1 ? "action required" : "actions required", href: "/journey" }}
      />

      <JourneyNudgeCard progress={journey.progress} isActivated={journey.activated} steps={journey.steps} />

      <ProfileScorecard steps={journey.steps} progress={journey.progress} activated={journey.activated} />

      <section className="dashboard-workflow command-centre-journey" aria-labelledby="career-journey-title">
        <div className="dashboard-section-heading">
          <div>
            <p className="product-system-eyebrow">Your career journey</p>
            <h2 id="career-journey-title">Every step connects to the next</h2>
          </div>
          <span>Live status from your private workspace</span>
        </div>

        <div className="command-centre-stage-track">
          <div className="command-centre-stage-line" aria-hidden="true" />
          {commandCentre.stages.map((stage, index) => (
            <Link
              className={`command-centre-stage is-${stage.state}`}
              href={stage.href}
              key={stage.id}
              aria-current={stage.state === "current" ? "step" : undefined}
            >
              <span className="command-centre-stage-marker" aria-hidden="true">
                {stage.state === "complete" ? "✓" : index + 1}
              </span>
              <span className="command-centre-stage-copy">
                <small>{stage.label}</small>
                <strong>{stage.value}</strong>
                <span>{stage.detail}</span>
              </span>
              <b aria-hidden="true">→</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="command-centre-focus" aria-label="Sartho priority guidance">
        <article className="command-centre-next-action">
          <div className="command-centre-action-copy">
            <p className="command-centre-kicker">{commandCentre.nextAction.eyebrow}</p>
            <h2>{commandCentre.nextAction.title}</h2>
            <p>{commandCentre.nextAction.description}</p>
          </div>
          <div className="command-centre-action-footer">
            <details>
              <summary>Why this now?</summary>
              <p>{commandCentre.nextAction.reason}</p>
            </details>
            <Link href={commandCentre.nextAction.href} className="command-centre-primary-action">
              {commandCentre.nextAction.label} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </article>

        <aside className="command-centre-ai-brief" aria-labelledby="ai-brief-title">
          <div className="command-centre-ai-heading">
            <span className="command-centre-ai-symbol" aria-hidden="true">✦</span>
            <div>
              <p className="product-system-eyebrow">AI career briefing</p>
              <small>Grounded in your approved data</small>
            </div>
          </div>
          {commandCentre.aiBrief ? (
            <>
              <div className="command-centre-ai-role">
                <span>{commandCentre.aiBrief.employer}</span>
                <h3 id="ai-brief-title">{commandCentre.aiBrief.title}</h3>
              </div>
              <p>{commandCentre.aiBrief.summary}</p>
              <div className="command-centre-ai-signals" aria-label="Opportunity signals">
                <span><strong>{commandCentre.aiBrief.match ?? "—"}</strong> profile support</span>
                <span><strong>{commandCentre.aiBrief.recommendation ?? "Pending"}</strong> recommendation</span>
                <span><strong>{commandCentre.aiBrief.analysisComplete ? "Complete" : "Next"}</strong> evidence mapping</span>
              </div>
              <Link href={commandCentre.aiBrief.href}>Review the evidence <span aria-hidden="true">→</span></Link>
            </>
          ) : (
            <div className="command-centre-ai-empty">
              <h3 id="ai-brief-title">Ready when your next role is.</h3>
              <p>Add a real job description and Sartho will explain the fit, gaps and best next action using your confirmed Career Profile.</p>
              <Link href="/applications#add-role">Analyse a role <span aria-hidden="true">→</span></Link>
            </div>
          )}
        </aside>
      </section>

      <section className="command-centre-review" aria-labelledby="review-queue-title">
        <div className="command-centre-review-heading">
          <div>
            <p className="product-system-eyebrow">Your review queue</p>
            <h2 id="review-queue-title">Decisions that need you</h2>
          </div>
          <span>Sartho recommends; you approve</span>
        </div>
        <div className="command-centre-review-list">
          {commandCentre.reviewItems.map((item) => (
            <Link href={item.href} className={`command-centre-review-item is-${item.tone}`} key={item.label}>
              <span className="command-centre-review-status" aria-hidden="true" />
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <b aria-hidden="true">→</b>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
