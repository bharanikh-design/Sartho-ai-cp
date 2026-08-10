import Link from "next/link";
import { DailyDigestSettings } from "@/components/daily-digest-settings";
import { ProductPageHeader } from "@/components/product-page-header";
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

  const [journeyResult, notificationResult, jobsResult, applicationsResult] = await Promise.all([
    loadProductJourney(supabase, user.id),
    supabase
      .from("notification_preferences")
      .select("email,daily_digest_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
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

  if (notificationResult.error) throw notificationResult.error;
  if (jobsResult.error) throw jobsResult.error;
  if (applicationsResult.error) throw applicationsResult.error;

  const { journey, workspace } = journeyResult;
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

  return (
    <div className="page-stack dashboard-page command-centre-page">
      <ProductPageHeader
        eyebrow="Career Command Centre"
        title={`Welcome back, ${firstName}.`}
        description="One connected view from Career Profile to outcome. Sartho uses your live workspace to explain what matters now and where to go next."
        metric={{ value: "1", label: "clear next action" }}
      />

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
              <Link href="/jobs#analyse">Analyse a role <span aria-hidden="true">→</span></Link>
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

      <DailyDigestSettings
        initialEmail={notificationResult.data?.email ?? user.email ?? ""}
        initialEnabled={notificationResult.data?.daily_digest_enabled ?? false}
        deliveryReady={Boolean(process.env.RESEND_API_KEY && process.env.SARTHO_EMAIL_FROM)}
      />
    </div>
  );
}
