import Link from "next/link";
import { OnboardingCarousel } from "@/components/onboarding-carousel";
import { ProductPageHeader } from "@/components/product-page-header";
import { JourneyNudgeCard } from "@/components/journey-nudge-card";
import { ProfileScorecard } from "@/components/profile-scorecard";
import { ResumeImport } from "@/components/resume-import";
import { SignedOutHome } from "@/components/signed-out-home";
import { getAuthenticatedUser } from "@/lib/auth";
import { connectionStatus } from "@/lib/integrations/store";
import { buildCareerCommandCentre } from "@/lib/dashboard/command-centre";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard";
import { DailyBriefCard } from "@/components/daily-brief-card";
import { buildDailyBrief } from "@/lib/dashboard/daily-brief";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
   * One address, two pages.
   *
   * This used to require a session, so a signed-out visitor was redirected to
   * /login and sartho.tech had no public face at all — a link sent to somebody
   * opened a sign-in form rather than an answer to "what is this". Google's
   * brand verification found it before any person complained and failed with
   * "your homepage is behind a login page", which is why its consent screen
   * kept naming a Supabase project reference instead of Sartho.
   *
   * Signed in, this is still the command centre and nothing below has changed.
   */
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return <SignedOutHome />;

  /*
   * Played once, on the way in from a successful sign-in, and never from a
   * bookmark or a reload — the callback sets this and the cinematic clears it.
   */
  await searchParams;
  let driveConnected = false;
  try {
    driveConnected = (await connectionStatus(user.id)).connected;
  } catch (error) {
    console.warn("Drive connection status unavailable; dashboard remains usable", error);
  }

  const dashboard = await loadDashboardData(supabase, user.id);
  const { journeyResult, jobs, applications } = dashboard;
  const dashboardDegraded = dashboard.unavailable.length > 0;

  const { journey, workspace } = journeyResult;
  const pendingSteps = journey.steps.filter((s) => !s.complete);
  const approvedEvidence = workspace.evidence.filter((item) => item.approval_status === "approved").length;
  const pendingEvidence = workspace.evidence.filter((item) => item.approval_status === "pending").length;
  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "there").split(" ")[0];
  /*
   * What Sartho says out loud when somebody walks in. Built from the same
   * workspace everything else on this page reads, and deliberately quiet when
   * there is nothing worth saying.
   */
  const dailyBrief = buildDailyBrief({
    now: new Date(),
    lastSeenAt: dashboard.lastSeenAt,
    firstName,
    jobs,
    pendingEvidence,
    search: dashboard.search,
  });
  const commandCentre = buildCareerCommandCentre({
    journey,
    jobs,
    applications,
    approvedEvidence,
    pendingEvidence,
  });

  /*
   * Everything Sartho does rests on approved evidence, so before a résumé
   * exists the dashboard is the upload and nothing else. Showing a pipeline, a
   * next-best-action and a résumé-tailoring workflow to someone with no data
   * is a room full of doors that all open onto empty.
   */
  const hasResume = journey.steps.find((step) => step.id === "resume")?.complete ?? false;
  if (!hasResume) {
    return (
      <>
      <div className="page-stack dashboard-page">
        <OnboardingCarousel user={user} />
        <Link href="/welcome" className="tour-replay-link" title="Take the Sartho product tour" aria-label="Take the Sartho product tour"><span aria-hidden="true">▶</span> Tour</Link>
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
          <ResumeImport hasEvidence={false} continueHref="/career-direction" driveConnected={driveConnected} />
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
      </>
    );
  }

  return (
    <>
    <div className="page-stack dashboard-page command-centre-page">
      <OnboardingCarousel user={user} />
      <Link href="/welcome" className="tour-replay-link" title="Take the Sartho product tour" aria-label="Take the Sartho product tour"><span aria-hidden="true">▶</span> Tour</Link>
      <ProductPageHeader
        eyebrow="Career Command Centre"
        title="Where your search stands."
        description="One connected view from Career Profile to outcome. Sartho uses your live workspace to explain what matters now and where to go next."
        metric={{ value: pendingSteps.length.toString(), label: pendingSteps.length === 1 ? "action required" : "actions required", href: "/journey" }}
      />

      {dashboardDegraded ? (
        <div className="inline-notice" role="status">
          Some opportunity or application data is temporarily unavailable. Your Career Profile and Journey are still current.
        </div>
      ) : null}

      {/*
        * Before the tiles, because it is the only part of the page that talks.
        * The greeting moved off the page header so it is said once, here.
        */}
      <DailyBriefCard brief={dailyBrief} />

      {/*
        * Directly under the header, above the nudge.
        *
        * It was below the nudge on the reasoning that somebody mid-flow wants
        * their next step first. That is true and it made the card the third
        * thing on a long page — which for anybody who had not already found
        * the extension or the master résumé meant they never did. A four-tile
        * card is read in two seconds; the next step is still immediately under
        * it.
        */}

      <section className="career-pulse" aria-labelledby="career-pulse-title">
        <article className="career-pulse-hero">
          <p className="product-system-eyebrow">{commandCentre.nextAction.eyebrow}</p>
          <h2 id="career-pulse-title">{commandCentre.nextAction.title}</h2>
          <p>{commandCentre.nextAction.description}</p>
          {commandCentre.aiBrief ? (
            <div className="career-pulse-proof">
              <span><strong>{commandCentre.aiBrief.match ?? "—"}</strong> Job Match</span>
              <span><strong>{commandCentre.aiBrief.recommendation ?? "Review"}</strong> recommendation</span>
              <span><strong>{commandCentre.aiBrief.analysisComplete ? "Mapped" : "Next"}</strong> evidence</span>
            </div>
          ) : null}
          <div className="career-pulse-action">
            <details><summary>Why this now?</summary><p>{commandCentre.nextAction.reason}</p></details>
            <Link href={commandCentre.nextAction.href} className="command-centre-primary-action">{commandCentre.nextAction.label} <span aria-hidden="true">→</span></Link>
          </div>
        </article>

        <div className="career-pulse-stack" aria-label="Career health">
          {/*
            * Each tile earns its place by being a next step, not a statistic.
            * The evidence tile leads with what needs a decision when something
            * does; otherwise it is a calm link into the Career Profile. It used
            * to point at /career-profile, which does not exist — a dead tile.
            */}
          <Link href="/career-truth" className="career-pulse-mini is-profile">
            <small>Career profile</small>
            {pendingEvidence ? (
              <><strong>{pendingEvidence}</strong><span>to review</span><em>Approve before Sartho uses it →</em></>
            ) : (
              <><strong>{approvedEvidence}</strong><span>evidence approved</span><em>Review your Career Profile →</em></>
            )}
          </Link>
          <Link href="/applications" className="career-pulse-mini">
            <small>Opportunities</small><strong>{jobs.filter((job) => job.recommendation === "apply").length}</strong><span>strong matches</span><em>See matched roles →</em>
          </Link>
          <Link href="/resume-studio" className="career-pulse-mini">
            <small>Résumé readiness</small><strong>{journey.steps.find((step) => step.id === "resume")?.complete ? "Ready" : "Next"}</strong><span>your master résumé</span><em>Open Résumé Studio →</em>
          </Link>
        </div>
      </section>

      <section className="career-rail" aria-labelledby="career-rail-title">
        <div className="career-rail-heading"><div><p className="product-system-eyebrow">Your career journey</p><h2 id="career-rail-title">From evidence to outcome</h2></div><span>{journey.progress}% complete</span></div>
        <div className="career-rail-track">
          {commandCentre.stages.map((stage, index) => (
            <Link href={stage.href} className={`career-rail-step is-${stage.state}`} key={stage.id} aria-current={stage.state === "current" ? "step" : undefined}>
              <i aria-hidden="true">{stage.state === "complete" ? "✓" : index + 1}</i><span><small>{stage.label}</small><strong>{stage.value}</strong></span>
            </Link>
          ))}
        </div>
      </section>

      {/*
        * The review queue is the only place on the page that asks for a
        * decision, so it renders only when there is one to make. An empty
        * "Decisions that need you" with nothing under it is the informational
        * clutter this page is meant to shed.
        */}
      {commandCentre.reviewItems.length ? (
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
      ) : null}

    </div>
    </>
  );
}
