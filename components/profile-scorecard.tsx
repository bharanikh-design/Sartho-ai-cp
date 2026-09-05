import Link from "next/link";
import type { ProductJourneyStep } from "@/lib/journey/product-journey";

/*
 * Where the profile stands, and the one thing to do next.
 *
 * The dashboard used to open with an advanced résumé-tailoring workflow — shown
 * to people who had not uploaded anything yet, and offering three roles they
 * had never saved. This replaces it with the only two facts that matter on
 * arrival: how complete the foundation is, and the single next step.
 *
 * One step, deliberately. A list of four outstanding items is a list to put
 * off; one is a thing to do.
 */
export function ProfileScorecard({
  steps,
  progress,
  activated,
}: {
  steps: ProductJourneyStep[];
  progress: number;
  activated: boolean;
}) {
  const next = steps.find((step) => !step.complete) ?? null;
  const done = steps.filter((step) => step.complete).length;

  return (
    <section className="glass-card profile-scorecard" aria-labelledby="scorecard-title">
      <div className="scorecard-head">
        <div>
          <p className="product-system-eyebrow">Your profile</p>
          <h2 id="scorecard-title">
            {activated ? "Your foundation is complete." : next ? next.title : "Almost there."}
          </h2>
          <p className="scorecard-detail">
            {activated
              ? "Sartho has everything it needs. Every match from here is scored against evidence you approved."
              : next?.description ?? "Finish the last step to switch on matching."}
          </p>
        </div>
        <div className="scorecard-dial" role="img" aria-label={`Profile ${progress}% complete`}>
          <strong>{progress}%</strong>
          <span>{done} of {steps.length} steps</span>
        </div>
      </div>

      <ol className="scorecard-steps">
        {steps.map((step) => (
          <li key={step.id} className={step.complete ? "is-complete" : step.id === next?.id ? "is-next" : ""}>
            <span aria-hidden="true">{step.complete ? "✓" : "○"}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
          </li>
        ))}
      </ol>

      {next ? (
        <div className="scorecard-action">
          <p>{next.reason}</p>
          <Link href={next.href} className="primary-button">
            {next.label} <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </section>
  );
}
