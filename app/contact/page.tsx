import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata(
  "Contact",
  "How to contact the team behind Sartho and WonderfulMinds.",
  "/contact",
);

export default function ContactPage() {
  return (
    <div className="page-stack product-page trust-page">
      <ProductPageHeader
        eyebrow="WonderfulMinds"
        title="Contact us"
        description="Questions about Sartho, your account, or how your information is handled."
      />

      <section className="glass-card content-card">
        <div className="card-header"><div><h2 className="section-heading">General support</h2></div></div>
        <p className="policy-prose">
          For product questions, account help, partnerships or feedback, email{" "}
          <a href="mailto:hello@sartho.tech">hello@sartho.tech</a>.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div><h2 className="section-heading">Privacy and data requests</h2></div></div>
        <p className="policy-prose">
          For access, correction, deletion, consent or privacy questions, email{" "}
          <a href="mailto:privacy@sartho.tech">privacy@sartho.tech</a>.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div><h2 className="section-heading">Operator</h2></div></div>
        <p className="policy-prose">
          Sartho is operated under the <strong>WonderfulMinds</strong> brand.
          If you need formal operator details for a contractual, regulatory or procurement purpose,
          contact us and we will provide the applicable details.
        </p>
      </section>

      <p className="policy-footer"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
    </div>
  );
}
