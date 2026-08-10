import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";

/*
 * A job that is gone is a real answer, not a wrong turn.
 *
 * The app-wide not-found sends unmatched URLs back to the front door, which is
 * right for a mistyped address but wrong here: silently landing someone on
 * their workspace after they followed a link to a specific role leaves them
 * wondering whether they clicked the wrong thing. This says what happened.
 */
export default function JobNotFound() {
  return (
    <div className="page-stack">
      <ProductPageHeader
        eyebrow="Opportunity unavailable"
        title="That role is no longer here."
        description="It may have been removed, or the link may be out of date. Everything else you are tracking is still where you left it."
      />
      <section className="glass-card content-card empty-state-card">
        <Link href="/jobs" className="primary-button">Back to opportunities <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
