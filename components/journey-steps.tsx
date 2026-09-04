import Link from "next/link";
import type { ProductJourneyState, ProductJourneyStepId } from "@/lib/journey/product-journey";

/*
 * The setup flow, made visible.
 *
 * Every setup page already said "Step 3 of 4" in a line of eyebrow text, but
 * nothing showed the whole sequence or where you were in it — so landing on a
 * page mid-flow felt like being dropped somewhere with no map. This renders the
 * four steps as one numbered track: completed steps are ticked, the current one
 * is lit, and every step links to its page so the sequence is also the nav.
 */

const STEP_TITLES: Record<ProductJourneyStepId, string> = {
  resume: "Résumé",
  confirm: "Confirm profile",
  direction: "Career direction",
  search: "Search brief",
};

export function JourneySteps({
  journey,
  currentId,
}: {
  journey: ProductJourneyState;
  currentId: ProductJourneyStepId;
}) {
  return (
    <nav className="journey-steps" aria-label="Setup progress">
      <ol className="journey-steps__track">
        {journey.steps.map((step, index) => {
          const isCurrent = step.id === currentId;
          const state = isCurrent ? "current" : step.complete ? "complete" : "upcoming";
          return (
            <li key={step.id} className={`journey-step is-${state}`}>
              <Link href={step.href} aria-current={isCurrent ? "step" : undefined}>
                <span className="journey-step__badge" aria-hidden="true">
                  {step.complete && !isCurrent ? "✓" : index + 1}
                </span>
                <span className="journey-step__copy">
                  <small>Step {index + 1}</small>
                  <strong>{STEP_TITLES[step.id]}</strong>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
