import type { CSSProperties } from "react";
import Link from "next/link";
import { EvidenceReview } from "@/components/evidence-review";
import { ResumeImport } from "@/components/resume-import";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace, getResumeImports } from "@/lib/data/career";
import { getFoundationState } from "@/lib/journey/foundation";

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const { supabase, user } = await requireUser();
  const [{ profile, roles, evidence }, imports] = await Promise.all([
    getCareerWorkspace(supabase, user.id),
    getResumeImports(supabase, user.id),
  ]);

  const approved = evidence.filter((item) => item.approval_status === "approved").length;
  const rejected = evidence.filter((item) => item.approval_status === "rejected").length;
  const pending = evidence.length - approved - rejected;
  const completeImports = imports.filter((item) => item.status === "complete").length;
  const processingImports = imports.filter((item) => item.status === "processing").length;
  const latestImport = imports[0] ?? null;
  const signals = Array.from(new Set(evidence.flatMap((item) => item.domains))).slice(0, 8);
  const state = getFoundationState({
    completedImports: completeImports,
    processingImports,
    roles: roles.length,
    evidence: evidence.length,
    approvedEvidence: approved,
    rejectedEvidence: rejected,
  });
  const progressStyle = { "--foundation-progress": `${state.progress}%` } as CSSProperties;

  return (
    <div className="foundation-page page-stack">
      <section className="glass-card foundation-hero">
        <div className="foundation-hero-copy">
          <div className="page-eyebrow"><span className="live-dot" /> Your career foundation</div>
          <h1>Your Sartho journey</h1>
          <p>
            Sartho first learns who you are, then asks you to confirm what it found.
            Only approved evidence can power career direction, matching, résumés or interview preparation.
          </p>
          <div className="foundation-trust-row">
            <span>Private upload</span><span>AI-assisted</span><span>Human approved</span>
          </div>
        </div>
        <div className="foundation-readiness" style={progressStyle} aria-label={`${state.progress}% journey complete`}>
          <div className="foundation-ring"><span>{state.progress}%</span></div>
          <strong>{state.readiness}</strong>
          <small>Journey completion</small>
        </div>
      </section>

      <section className="glass-card foundation-route" aria-labelledby="foundation-route-title">
        <div className="foundation-section-heading">
          <div><div className="page-eyebrow">Start to finish</div><h2 id="foundation-route-title">Build the evidence Sartho can trust</h2></div>
          <span>Step {state.currentStep} of 3</span>
        </div>
        <ol className="foundation-track" style={progressStyle}>
          <span className="foundation-track-line" aria-hidden="true"><i /></span>
          {state.steps.map((step, index) => (
            <li key={step.id} className={`foundation-node is-${step.state}`}>
              <a href={`#${step.id}`} aria-current={step.state === "current" ? "step" : undefined}>
                <span className="foundation-node-marker">{step.state === "complete" ? "✓" : index + 1}</span>
                <small>Step {index + 1}</small>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
                {step.state === "current" ? <em>Continue here</em> : null}
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section id="resume" className={`glass-card foundation-stage is-${state.steps[0].state}`}>
        <StageHeader number="01" label="Resume upload" state={state.steps[0].state}>
          Bring in the master résumé that best represents your career today. The original file is removed after secure text extraction; the private text record remains so Sartho can explain where its claims came from.
        </StageHeader>
        <div className="foundation-stage-body upload-stage-body">
          <ResumeImport hasEvidence={evidence.length > 0} showLead={false} continueHref="/journey#confirm" />
          <aside className="foundation-stage-aside">
            <span className="stage-aside-label">Accepted</span>
            <strong>PDF · Word · Text</strong>
            <p>Maximum 8MB. Nothing extracted becomes usable evidence without Step 3.</p>
          </aside>
        </div>
      </section>

      <section id="review" className={`glass-card foundation-stage is-${state.steps[1].state}`}>
        <StageHeader number="02" label="AI resume review" state={state.steps[1].state}>
          Sartho maps roles, achievements, skills, certifications and measurable outcomes. It records evidence—it does not rewrite your history or invent missing facts.
        </StageHeader>
        {evidence.length ? (
          <div className="foundation-ai-summary">
            <div className="foundation-summary-metrics">
              <SummaryMetric value={String(roles.length)} label="Roles identified" />
              <SummaryMetric value={String(evidence.length)} label="Evidence records" />
              <SummaryMetric value={String(signals.length)} label="Career signals" />
            </div>
            <div className="foundation-positioning">
              <span>Initial positioning</span>
              <strong>{profile?.headline ?? "Career evidence extracted"}</strong>
              <p>{profile?.summary ?? "Your evidence is ready for your review before Sartho uses it anywhere."}</p>
            </div>
            {signals.length ? <div className="foundation-signal-list">{signals.map((signal) => <span key={signal}>{signal}</span>)}</div> : null}
            <div className="foundation-source-line">
              <span>Latest source</span><strong>{latestImport?.file_name ?? "Resume import"}</strong><small>{latestImport?.status === "complete" ? "Read successfully" : latestImport?.status ?? "Evidence available"}</small>
            </div>
          </div>
        ) : (
          <div className="foundation-waiting-state">
            <span className="foundation-waiting-icon">AI</span>
            <div><strong>{processingImports ? "Sartho is reading your résumé" : "Waiting for your résumé"}</strong><p>{processingImports ? "The page will preserve your progress. When extraction finishes, the findings appear here for review." : "Complete Step 1 and Sartho will map your career evidence automatically."}</p></div>
          </div>
        )}
      </section>

      <section id="confirm" className={`glass-card foundation-stage is-${state.steps[2].state}`}>
        <StageHeader number="03" label="Your confirmation" state={state.steps[2].state}>
          Approve what is accurate, edit wording that needs context, and reject anything misleading. This is the human-control gate for the whole product.
        </StageHeader>
        {evidence.length ? (
          <div className="foundation-confirmation">
            <div className="foundation-review-summary">
              <div><strong>{pending}</strong><span>Need your decision</span></div>
              <div><strong>{approved}</strong><span>Approved for use</span></div>
              <div><strong>{rejected}</strong><span>Excluded</span></div>
              {pending === 0 && approved > 0 ? <Link href="/" className="primary-button">Open your dashboard <span aria-hidden="true">→</span></Link> : null}
            </div>
            <EvidenceReview initialItems={evidence} />
          </div>
        ) : (
          <div className="foundation-locked-state"><span>03</span><div><strong>This step opens after AI review</strong><p>Your approval controls remain locked until Sartho has real evidence to show you.</p></div></div>
        )}
      </section>

      <section className="foundation-next glass-card-soft">
        <div><span>What follows</span><strong>Career Direction → Search Plan → Opportunity Dashboard</strong></div>
        <p>We will activate these only after your foundation is confirmed. That keeps every later recommendation personal, explainable and honest.</p>
      </section>
    </div>
  );
}

function StageHeader({ number, label, state, children }: { number: string; label: string; state: "complete" | "current" | "upcoming"; children: React.ReactNode }) {
  return (
    <header className="foundation-stage-header">
      <span className="foundation-stage-number">{state === "complete" ? "✓" : number}</span>
      <div><span className="foundation-stage-kicker">Step {Number(number)} · {state === "complete" ? "Complete" : state === "current" ? "In progress" : "Upcoming"}</span><h2>{label}</h2><p>{children}</p></div>
      <span className={`foundation-state-chip is-${state}`}>{state === "complete" ? "Complete" : state === "current" ? "Your next action" : "Not started"}</span>
    </header>
  );
}

function SummaryMetric({ value, label }: { value: string; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}
