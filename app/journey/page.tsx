import Link from "next/link";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const { supabase, user } = await requireUser();
  const journey = await loadProductJourneyStatus(supabase, user.id);
  const { steps, current, currentIndex, progress, activated } = journey;

  return (
    <div className="journey-prototype-page">
      <header className="journey-page-heading">
        <p>Getting to know you</p>
        <h1>Your Sartho journey</h1>
        <span>One clear path from your résumé to an activated opportunity search.</span>
      </header>

      <section className="panel journey-hero-exact">
        <div className="journey-hero-copy-exact">
          <p className="journey-micro-label">Your career foundation</p>
          <h2>{activated ? "Your search foundation is ready." : "Complete the foundation once. Improve it whenever life changes."}</h2>
          <p>{activated ? "Sartho has the Career Profile, direction and search coverage needed to support opportunity decisions." : "Finish the current step so recommendations reflect your career, ambitions, mobility and chosen sources."}</p>
          <div className="readiness-notes-exact">
            <span className={steps[0].complete ? "is-done" : "is-missing"}>{steps[0].complete ? "✓" : "＋"} Résumé source {steps[0].complete ? "received" : "needed"}</span>
            <span className={steps[2].complete ? "is-done" : "is-missing"}>{steps[2].complete ? "✓" : "＋"} Career Profile {steps[2].complete ? "confirmed" : "needs review"}</span>
            <span className={steps[6].complete ? "is-done" : "is-missing"}>{steps[6].complete ? "✓" : "＋"} Search coverage {steps[6].complete ? "confirmed" : "needs you"}</span>
          </div>
        </div>
        <div className="readiness-visual-exact">
          <div className="readiness-ring-exact" style={{ "--readiness": `${progress}%` } as CSSProperties}><span>{progress}%</span></div>
          <div><strong>Journey completion</strong><span>{activated ? "Search activated" : `${journey.completedSteps} of ${steps.length} steps complete`}</span></div>
        </div>
      </section>

      <section className="panel foundation-map-exact">
        <div className="foundation-heading-exact">
          <div><p className="journey-micro-label">Start to finish</p><h2>Your seven-step foundation</h2><p>Each stage makes Sartho&apos;s recommendations more relevant to you.</p></div>
          <div className="journey-percent-exact"><strong>{progress}%</strong><span>Journey complete</span></div>
        </div>
        <div className="journey-track-exact" aria-label="User journey progress">
          <div className="journey-rail-exact"><span style={{ width: `${progress}%` }} /></div>
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
        <div className="stage-index-exact"><span>{String(currentIndex + 1).padStart(2, "0")}</span><small>of 07</small></div>
        <div className="stage-workspace-exact">
          <p className="journey-micro-label">Current step</p>
          <h2>{activated ? "Your foundation is active" : current.title}</h2>
          <p>{activated ? "Open Home to review opportunity activity, applications and the next best action." : current.description}</p>
          <div className="stage-progress-label-exact"><span>Journey completion</span><strong>{progress}%</strong></div>
          <div className="stage-progress-exact"><span style={{ width: `${progress}%` }} /></div>
        </div>
        <aside className="stage-guidance-exact">
          <span className="guidance-spark">✦</span>
          <div><strong>{activated ? "Keep it current" : "Why this matters"}</strong><p>{activated ? "Return whenever your goals, mobility, résumé or preferred sources change." : current.reason}</p></div>
          <Link className="journey-continue-button" href={activated ? "/" : current.href}>{activated ? "Open Home" : "Continue this step"} <span>→</span></Link>
        </aside>
      </section>
    </div>
  );
}
