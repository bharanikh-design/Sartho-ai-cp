import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata(
  "Terms",
  "What Sartho does, what it will not do, and what is expected of you.",
  "/terms",
);

/*
 * The terms, kept to what is actually true of this product.
 *
 * Deliberately short. A long agreement nobody reads protects nobody, and most
 * of what a template would add here describes obligations Sartho does not have
 * and rights it does not want. What is worth saying is the part that is unusual
 * about this product: it will not write a claim about you that you have not
 * evidenced, and a job market is not something anybody can make promises about.
 *
 * Public, so somebody can read it before signing up — and required by Google's
 * OAuth brand verification.
 */

const LAST_UPDATED = "25 September 2026";

export default function TermsPage() {
  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Sartho"
        title="Terms of service"
        description={`What Sartho does, what it will not do, and what is expected of you. Last updated ${LAST_UPDATED}.`}
      />

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What Sartho is</h2>
          </div>
        </div>
        <p className="policy-prose">
          Sartho is an AI Career Copilot operated under the <strong>WonderfulMinds</strong> brand. It reads job adverts, assesses them against
          evidence you have confirmed about your own career, and helps you build
          résumés from that evidence. Using it requires an account, and you are
          responsible for what happens under yours.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What Sartho will not do</h2>
            <p className="section-subtitle">The constraint the whole product is built around.</p>
          </div>
        </div>
        <p className="policy-prose">
          Sartho will not write a claim about you that you have not evidenced. A
          résumé line is drawn from something you approved, a requirement is
          assessed as met only where you can point at proof, and a gap is
          reported as a gap. This is a deliberate limit: a tool that invents a
          qualification is not helping you, it is setting up an interview you
          cannot survive.
        </p>
        <p className="policy-prose">
          What you send to an employer is yours, and checking it before you send
          it is yours too.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What is expected of you</h2>
          </div>
        </div>
        <ul className="policy-bullets">
          <li>That the evidence you confirm about your career is true.</li>
          <li>That you do not use Sartho to misrepresent yourself to an employer.</li>
          <li>That you do not attempt to reach another person&rsquo;s data, or to use the service in a way that degrades it for anybody else.</li>
          <li>That you keep your account credentials to yourself.</li>
        </ul>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What Sartho cannot promise</h2>
          </div>
        </div>
        <p className="policy-prose">
          No outcome in a job market. Sartho can tell you how much of an advert
          you can evidence; it cannot tell you who will call you back.
        </p>
        <p className="policy-prose">
          Job listings come from third parties — Google for Jobs, Adzuna, and
          employers&rsquo; own careers pages. Sartho reports what they return and
          when it read them, and cannot guarantee a role is still open or that an
          advert is accurate. The service is provided as it is, and may change or
          be unavailable while it is being improved.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Ending it</h2>
          </div>
        </div>
        <p className="policy-prose">
          You can stop using Sartho at any time, and deleting your account
          deletes the data attached to it. Sartho may suspend an account that
          breaks the expectations above. Questions about these terms go to{" "}
          <a href="mailto:hello@sartho.tech">hello@sartho.tech</a>. Privacy matters go to{" "}
          <a href="mailto:privacy@sartho.tech">privacy@sartho.tech</a>.
        </p>
      </section>

      <p className="policy-footer">
        <Link href="/privacy">Privacy</Link> · <Link href="/contact">Contact us</Link>
      </p>
    </div>
  );
}
