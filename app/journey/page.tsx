import Link from "next/link";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace, getResumeImports } from "@/lib/data/career";

export const dynamic = "force-dynamic";

type JourneyStep = {
  label: string;
  detail: string;
  href: string;
  complete: boolean;
  title: string;
  description: string;
  reason: string;
};

export default async function JourneyPage() {
  const { supabase, user } = await requireUser();
  const [{ profile, lanes, roles, evidence }, imports] = await Promise.all([
    getCareerWorkspace(supabase, user.id),
    getResumeImports(supabase, user.id),
  ]);

  const approved = evidence.filter((item) => item.approval_status === "approved").length;
  const pending = evidence.filter((item) => item.approval_status === "pending").length;
  const completeImports = imports.filter((item) => item.status === "complete").length;
  const activeAllocation = lanes.filter((lane) => lane.active).reduce((total, lane) => total + lane.weight, 0);
  const suggestedStrengths = Array.from(new Set(evidence.flatMap((item) => item.domains))).slice(0, 4);

  const steps: JourneyStep[] = [
    {
      label: "Resume upload",
      detail: completeImports ? "Master resume received" : "Bring in your career evidence",
      href: "/resume-studio",
      complete: completeImports > 0,
      title: "Upload your master resume",
      description: "Give Sartho the best available record of your experience, achievements and certifications.",
      reason: "Every recommendation begins with evidence from a source you control.",
    },
    {
      label: "AI resume review",
      detail: evidence.length ? `${roles.length} roles and ${evidence.length} evidence records mapped` : "Map experience and evidence",
      href: "/career-truth",
      complete: evidence.length > 0,
      title: "Review what Sartho found",
      description: "Check the roles, outcomes, skills and certifications extracted from your resume.",
      reason: "AI proposes evidence; you decide whether it is accurate.",
    },
    {
      label: "Career context",
      detail: profile?.headline && profile.location ? "Goals and experience confirmed" : "Goals, location and mobility",
      href: "/career-direction#context",
      complete: Boolean(profile?.headline && profile.location),
      title: "Confirm your career context",
      description: "Tell Sartho what a successful next move looks like, where you can work and what matters now.",
      reason: "The same resume can point to very different futures. Context makes recommendations personal.",
    },
    {
      label: "Career strengths",
      detail: profile?.strengths.length ? `${profile.strengths.length} strengths selected` : "Reviewing AI suggestions",
      href: "/career-direction#strengths",
      complete: Boolean(profile?.strengths.length),
      title: "Confirm your career strengths",
      description: "Keep, edit or remove the strengths Sartho found in your resume and career evidence.",
      reason: "These strengths become the evidence signals used to rank profiles and opportunities.",
    },
    {
      label: "Profile & search priorities",
      detail: lanes.length && activeAllocation === 100 ? `${lanes.length} target profiles weighted` : "Roles, locations and mobility",
      href: "/career-direction#priorities",
      complete: lanes.length > 0 && activeAllocation === 100,
      title: "Set your profile search order",
      description: "Add, rank and weight the roles Sartho should pursue, then confirm your locations and mobility.",
      reason: "Your priorities determine what Sartho searches first and what it deliberately ignores.",
    },
    {
      label: "Review & activate",
      detail: pending ? `${pending} evidence decisions remain` : approved ? "Foundation confirmed" : "Confirm what Sartho knows",
      href: "/career-truth",
      complete: pending === 0 && approved > 0,
      title: "Review and activate your foundation",
      description: "Approve what is accurate, reject what is misleading and activate your evidence-led search.",
      reason: "Nothing becomes a recommendation, resume claim or interview answer until you approve it.",
    },
  ];

  const completed = steps.filter((step) => step.complete).length;
  const currentIndex = Math.max(0, steps.findIndex((step) => !step.complete));
  const current = steps[currentIndex] ?? steps[steps.length - 1];
  const journeyProgress = Math.round((completed / steps.length) * 100);
  const knowledgeReadiness = Math.min(100, Math.round((evidence.length ? 35 : 0) + (profile ? 20 : 0) + (profile?.strengths.length ? 15 : 0) + (lanes.length ? 15 : 0) + (approved ? 15 : 0)));

  return (
    <div className="journey-prototype-page">
      <header className="journey-page-heading">
        <p>Getting to know you</p>
        <h1>Your Sartho journey</h1>
        <span>Give Sartho enough context to make useful, evidence-based recommendations.</span>
      </header>

      <section className="panel journey-hero-exact">
        <div className="journey-hero-copy-exact">
          <p className="journey-micro-label">Your career foundation</p>
          <h2>Good enough to begin. Better with every step.</h2>
          <p>Sartho already understands enough to start helping you. Complete the remaining journey so every recommendation is grounded in your evidence, ambitions and mobility.</p>
          <div className="readiness-notes-exact">
            <span className={completeImports ? "is-done" : ""}>✓ Resume understood</span>
            <span className={profile ? "is-done" : ""}>✓ Career context {profile ? "captured" : "needed"}</span>
            <span className={lanes.length ? "is-done" : "is-missing"}>＋ Profile priorities {lanes.length ? "captured" : "need you"}</span>
          </div>
        </div>
        <div className="readiness-visual-exact">
          <div className="readiness-ring-exact" style={{ "--readiness": `${knowledgeReadiness}%` } as CSSProperties}><span>{knowledgeReadiness}%</span></div>
          <div><strong>Knowledge readiness</strong><span>{knowledgeReadiness >= 70 ? "Strong foundation" : "Building your foundation"}</span></div>
        </div>
      </section>

      <section className="panel foundation-map-exact">
        <div className="foundation-heading-exact">
          <div><p className="journey-micro-label">Start to finish</p><h2>Your six-step foundation</h2><p>Each stage gives Sartho better evidence for the decisions that follow.</p></div>
          <div className="journey-percent-exact"><strong>{journeyProgress}%</strong><span>Journey complete</span></div>
        </div>
        <div className="journey-track-exact" aria-label="User journey progress">
          <div className="journey-rail-exact"><span style={{ width: `${journeyProgress}%` }} /></div>
          {steps.map((step, index) => {
            const state = step.complete ? "complete" : index === currentIndex ? "current" : "pending";
            return (
              <Link className={`journey-node-exact ${state}`} href={step.href} key={step.label} aria-current={state === "current" ? "step" : undefined}>
                <span className="node-marker-exact">{step.complete ? "✓" : index + 1}</span>
                <span className="node-step-exact">Step {index + 1}</span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
                {state === "current" ? <span className="current-flag-exact">✦ In progress</span> : null}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="current-stage-card-exact">
        <div className="stage-index-exact"><span>{String(currentIndex + 1).padStart(2, "0")}</span><small>of 06</small></div>
        <div className="stage-workspace-exact">
          <p className="journey-micro-label">Current step</p>
          <h2>{current.title}</h2>
          <p>{current.description}</p>
          <div className="stage-progress-label-exact"><span>Journey completion</span><strong>{journeyProgress}%</strong></div>
          <div className="stage-progress-exact"><span style={{ width: `${journeyProgress}%` }} /></div>
          {currentIndex === 3 && suggestedStrengths.length ? <div className="strength-review-exact">{suggestedStrengths.map((strength) => <span key={strength}>✓ {strength}</span>)}</div> : null}
        </div>
        <aside className="stage-guidance-exact">
          <span className="guidance-spark">✦</span>
          <div><strong>Why this matters</strong><p>{current.reason}</p></div>
          <Link className="journey-continue-button" href={current.href}>Continue this step <span>→</span></Link>
        </aside>
      </section>
    </div>
  );
}
