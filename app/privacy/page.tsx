import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata(
  "Privacy",
  "What Sartho stores, what it sends elsewhere, and what it never keeps.",
  "/privacy",
);

/*
 * What Sartho actually does with somebody's data.
 *
 * Written from the code rather than from a template. Every claim below was
 * checked against the thing that implements it — the migrations for what is
 * stored, lib/integrations/google.ts for the scopes, extension/manifest.json
 * for the permissions, app/api/resume for what happens to an upload. A privacy
 * policy that describes a product nobody built is worse than none: it is a
 * promise made on behalf of code that never agreed to it.
 *
 * Public, because somebody deciding whether to sign up has to be able to read
 * it before they do. Also required by Google's OAuth brand verification, which
 * is what stops the sign-in screen naming a Supabase project reference instead
 * of Sartho.
 */

const LAST_UPDATED = "13 September 2026";

/* Each item names the thing in the product, not a category of data. */
const STORED: Array<{ what: string; why: string }> = [
  {
    what: "Your account",
    why: "An email address, and a Google account identifier if you sign in with Google. Held by Supabase Auth, which is what signs you in.",
  },
  {
    what: "Your Career Profile",
    why: "The roles, evidence and target lanes you confirm. This is the material every match and every résumé is built from, and nothing is used until you have approved it.",
  },
  {
    what: "Roles you save",
    why: "The advert text, where it came from, its requirements once analysed, and the status you set. Saved so a score can be checked against the source it came from.",
  },
  {
    what: "Résumés you build",
    why: "Each version, with the evidence each line was drawn from, so a claim can always be traced back to something you approved.",
  },
  {
    what: "Your settings",
    why: "Search brief, notification preferences, and which integrations you have connected.",
  },
];

const NOT_STORED: Array<{ what: string; detail: string }> = [
  {
    what: "The résumé file you upload",
    detail: "It is read in the request that receives it and never written to disk or to storage. What is kept is the file's name, type and size, and how many roles and evidence items came out of it — not the document.",
  },
  {
    what: "Applicant counts and hiring contacts",
    detail: "Read off a job board at the moment the extension captures a role and shown to you once. Sartho keeps the advert, not a snapshot of how many people had applied on a Tuesday afternoon.",
  },
  {
    what: "Anything in the shared advert cache",
    detail: "Sartho keeps the job adverts a search returns so the next search is faster and cheaper. Those rows are keyed by the query — the role title and the market — and contain no record of who searched for them.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Sartho"
        title="Privacy"
        description={`What Sartho stores, what it sends elsewhere, and what it never keeps. Last updated ${LAST_UPDATED}.`}
      />

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What Sartho stores</h2>
            <p className="section-subtitle">All of it against your account, and all of it deleted with your account.</p>
          </div>
        </div>
        <dl className="policy-list">
          {STORED.map((item) => (
            <div className="policy-item" key={item.what}>
              <dt>{item.what}</dt>
              <dd>{item.why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What Sartho does not keep</h2>
            <p className="section-subtitle">Worth stating plainly, because each one is a decision rather than an oversight.</p>
          </div>
        </div>
        <dl className="policy-list">
          {NOT_STORED.map((item) => (
            <div className="policy-item" key={item.what}>
              <dt>{item.what}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Where your data goes</h2>
            <p className="section-subtitle">Sartho is not the only system that sees it, so here is every one that does.</p>
          </div>
        </div>
        <dl className="policy-list">
          <div className="policy-item">
            <dt>Supabase</dt>
            <dd>Hosts the database and signs you in. Everything in the list above lives there, with row-level security so one account cannot read another&rsquo;s rows.</dd>
          </div>
          <div className="policy-item">
            <dt>Vercel</dt>
            <dd>Runs and serves the application.</dd>
          </div>
          <div className="policy-item">
            <dt>An AI provider</dt>
            <dd>
              Analysing a role and drafting a résumé send the job advert and the
              evidence you have approved to a large language model. Nothing is
              sent that you have not confirmed, and the model is never asked to
              invent a fact about you — it is asked to assess what the advert
              requires against what you can already evidence.
            </dd>
          </div>
          <div className="policy-item">
            <dt>Job search providers</dt>
            <dd>
              Searching sends the role titles and market from your brief to
              Google for Jobs (through SerpApi) and to Adzuna. It does not send
              your name, your evidence or your résumé.
            </dd>
          </div>
          <div className="policy-item">
            <dt>Google Drive, only if you connect it</dt>
            <dd>
              The integration asks for read-only access to your Drive and your
              email address, so you can import a résumé you already have. It
              reads the file you pick. You can disconnect it at any time in
              Integrations, which discards the tokens.
            </dd>
          </div>
        </dl>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">The browser extension</h2>
            <p className="section-subtitle">It reads one tab, when you click it, and never on its own.</p>
          </div>
        </div>
        <p className="policy-prose">
          The extension has no standing permission on any job board. Clicking its
          icon is what grants access, to that tab only, for that moment — which
          is why it cannot watch you browse. What it reads is the advert on the
          page you are looking at, and it shows you exactly what it read before
          anything is sent. A captured role waits in your browser&rsquo;s own
          storage until Sartho confirms it has been saved, so signing in late or
          reloading does not lose it.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Your data is yours</h2>
          </div>
        </div>
        <p className="policy-prose">
          You can edit or delete any role, any piece of evidence and any résumé
          from inside Sartho. Deleting your account deletes everything attached
          to it. To ask for a copy of your data, or to have it removed, email{" "}
          <a href="mailto:privacy@sartho.tech">privacy@sartho.tech</a> and it
          will be dealt with.
        </p>
        <p className="policy-prose">
          Sartho does not sell your data, and does not share it with anybody
          beyond the services named above.
        </p>
      </section>

      <p className="policy-footer">
        <Link href="/terms">Terms of service</Link>
      </p>
    </div>
  );
}
