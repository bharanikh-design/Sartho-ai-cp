import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata(
  "Privacy",
  "How Sartho and WonderfulMinds collect, use, store and protect your information.",
  "/privacy",
);

const LAST_UPDATED = "25 September 2026";

export default function PrivacyPage() {
  return (
    <div className="page-stack product-page trust-page">
      <ProductPageHeader
        eyebrow="WonderfulMinds · Sartho"
        title="Privacy policy"
        description={"How Sartho collects, uses and protects information. Last updated " + LAST_UPDATED + "."}
      />

      <section className="glass-card content-card">
        <div className="card-header"><div>
          <h2 className="section-heading">Who operates Sartho</h2>
          <p className="section-subtitle">The product and the party responsible for this policy.</p>
        </div></div>
        <p className="policy-prose">
          Sartho is an AI Career Copilot operated under the <strong>WonderfulMinds</strong> brand.
          WonderfulMinds determines how information collected through Sartho is used for the purposes
          described in this policy. Privacy questions and data requests can be sent to{" "}
          <a href="mailto:privacy@sartho.tech">privacy@sartho.tech</a>.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div>
          <h2 className="section-heading">Information we collect</h2>
          <p className="section-subtitle">Only what is needed to operate the career workflow and improve the service.</p>
        </div></div>
        <dl className="policy-list">
          <div className="policy-item"><dt>Account and profile</dt><dd>Your email address, sign-in provider, name and profile information such as location and work authorisation when you provide them.</dd></div>
          <div className="policy-item"><dt>Résumé and career information</dt><dd>The original résumé files you upload are kept in private storage so you can retrieve and manage them. Sartho also stores the career roles, evidence, strengths, target roles and résumé versions derived from or created with your information.</dd></div>
          <div className="policy-item"><dt>Search and opportunity information</dt><dd>Your Search Brief, saved search results, job adverts, job analyses, application stages, outcomes and related preparation material.</dd></div>
          <div className="policy-item"><dt>Connected services</dt><dd>Connection information and tokens for integrations you choose to enable, such as Google Drive. Access is limited to the permissions required by the integration and can be disconnected.</dd></div>
          <div className="policy-item"><dt>Logged-in usage</dt><dd>Sartho measures when a signed-in account was last active, observed foreground-use time and visit count. It does not create a page-by-page browsing history for signed-in users.</dd></div>
          <div className="policy-item"><dt>Optional pre-login analytics</dt><dd>If you allow analytics, Sartho stores a random browser identifier, first and last visit time, visit/page counts, first and last Sartho path, referring host and whether that browser later converted to an account. Sartho does not store an IP address or device fingerprint for this feature.</dd></div>
        </dl>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div>
          <h2 className="section-heading">Why we use it</h2>
        </div></div>
        <ul className="policy-bullets">
          <li>To authenticate you and secure your account.</li>
          <li>To build and maintain your Career Profile and Candidate Context.</li>
          <li>To search for roles, assess opportunities and explain matches and gaps.</li>
          <li>To create résumé and interview-preparation material grounded in information you supplied or approved.</li>
          <li>To track application progress and learn from outcomes you record.</li>
          <li>To operate, troubleshoot, secure and improve Sartho.</li>
          <li>When you allow optional analytics, to understand how many visitors reach Sartho and how often those visits lead to accounts.</li>
        </ul>
      </section>

      <section className="glass-card content-card" id="browser-storage">
        <div className="card-header"><div>
          <h2 className="section-heading">Cookies and browser storage</h2>
          <p className="section-subtitle">Necessary storage and optional analytics are treated separately.</p>
        </div></div>
        <p className="policy-prose">
          Sartho uses necessary browser/session storage for authentication, security, appearance and privacy
          preferences. The service may not work correctly without this storage.
        </p>
        <p className="policy-prose">
          Optional analytics is off until you choose <strong>Allow analytics</strong>. Only after that choice does
          Sartho create the random anonymous visitor identifier used for pre-login analytics. Choosing
          <strong> Necessary only</strong> prevents that tracking. You can reopen Cookie Preferences from the
          footer at any time. Revoking analytics removes that browser&rsquo;s anonymous telemetry record and local
          visitor identifier where the browser can still identify it.
        </p>
        <p className="policy-prose">Sartho does not use advertising cookies or third-party advertising trackers.</p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div>
          <h2 className="section-heading">AI processing</h2>
        </div></div>
        <p className="policy-prose">
          Sartho uses configured AI providers for specific tasks such as résumé extraction, Career Direction,
          semantic Job Context, requirement analysis, résumé drafting and interview preparation. The provider is
          sent only the information needed for that task, which may include résumé content, approved career evidence
          or a job advert. Sartho instructs these systems not to invent facts about you and applies deterministic
          grounding checks where the workflow requires factual evidence.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div>
          <h2 className="section-heading">Service providers and international processing</h2>
        </div></div>
        <p className="policy-prose">
          Sartho relies on service providers including Supabase for authentication/database/storage, Vercel for
          application hosting, configured AI providers for AI workloads, and job-search providers such as Google
          for Jobs through SerpApi and Adzuna. Connected services such as Google are used only when you choose to
          connect them. These providers may process information in countries different from yours.
        </p>
        <p className="policy-prose">
          Job-search queries send search terms and market information to job providers; they do not need your résumé
          or full Career Profile to perform the search.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div><h2 className="section-heading">Retention and deletion</h2></div></div>
        <p className="policy-prose">
          Account data is retained while your Sartho account and its associated career records are needed to provide
          the service. You can delete your data or delete your account from Sartho&rsquo;s account controls.
          Account deletion removes the career records and stored résumé uploads associated with the account.
        </p>
        <p className="policy-prose">
          Anonymous analytics is separate from account data. If the browser that created the anonymous identifier
          revokes analytics consent, Sartho attempts to delete the matching anonymous telemetry record immediately.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div><h2 className="section-heading">Your choices and rights</h2></div></div>
        <ul className="policy-bullets">
          <li>Review and edit the career information held in your account.</li>
          <li>Disconnect optional integrations.</li>
          <li>Decline or later revoke optional analytics.</li>
          <li>Delete your career data while keeping the login, or delete the account entirely.</li>
          <li>Ask for access, correction, deletion or other privacy assistance by contacting us.</li>
        </ul>
        <p className="policy-prose">
          Sartho does not sell personal information to advertisers and does not use your career information to
          serve third-party advertising.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header"><div><h2 className="section-heading">Contact</h2></div></div>
        <p className="policy-prose">
          Privacy and data requests: <a href="mailto:privacy@sartho.tech">privacy@sartho.tech</a>.<br />
          General enquiries: <a href="mailto:hello@sartho.tech">hello@sartho.tech</a>.
        </p>
      </section>

      <p className="policy-footer"><Link href="/terms">Terms of service</Link> · <Link href="/contact">Contact us</Link></p>
    </div>
  );
}
