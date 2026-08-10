import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { WorkflowHandoff } from "@/components/workflow-handoff";
import { requireUser } from "@/lib/auth";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const { supabase, user } = await requireUser();
  const journey = await loadProductJourneyStatus(supabase, user.id);
  const { steps, current, currentIndex, progress, activated } = journey;

  return (
    <div className="page-stack">
      <ProductPageHeader
        eyebrow="Your foundation"
        title="Four steps from résumé to a focused search."
        description="Complete this once, then return only when your experience, direction or search constraints change. AI organises and suggests; you confirm every decision."
        metric={{ value: `${progress}%`, label: activated ? "Foundation ready" : "Foundation complete" }}
      />

      <section className="journey-system-progress" aria-labelledby="journey-path-title">
        <div className="product-system-section-header">
          <div>
            <p className="product-system-eyebrow">Setup path</p>
            <h2 id="journey-path-title">Know me, guide me, then search.</h2>
            <p>Each step produces something the next step uses. No disconnected forms and no hidden completion rules.</p>
          </div>
        </div>

        <div className="journey-system-summary">
          <strong>{activated ? "All four foundation steps are complete." : `Step ${currentIndex + 1} is next: ${current.label}`}</strong>
          <span>{journey.completedSteps} of {steps.length} complete</span>
        </div>
        <div className="journey-system-rail" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>

        <ol className="journey-system-list">
          {steps.map((step, index) => {
            const state = step.complete ? "complete" : index === currentIndex ? "current" : "pending";
            return (
              <li className={`journey-system-step is-${state}`} key={step.id}>
                <Link href={step.href} aria-current={state === "current" ? "step" : undefined}>
                  <span className="journey-system-step__marker" aria-hidden="true">{step.complete ? "✓" : index + 1}</span>
                  <span className="journey-system-step__copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
                  <em className="journey-system-step__state">{step.complete ? "Complete" : state === "current" ? "Continue" : "Follows next"}</em>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <WorkflowHandoff
        eyebrow={activated ? "Recurring workflow" : `Current step · ${currentIndex + 1} of ${steps.length}`}
        title={activated ? "Your foundation is ready. Start with the next opportunity." : current.title}
        description={activated ? "Sartho can now compare roles with your confirmed Career Profile and keep each decision connected to preparation and outcomes." : current.description}
        reason={activated ? "The setup exists to support opportunity decisions—not to become a permanent checklist." : current.reason}
        href={activated ? "/jobs" : current.href}
        label={activated ? "Open opportunities" : "Continue this step"}
      />
    </div>
  );
}
