import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { probeProviders } from "@/lib/ai/provider";

/*
 * Is this deployment actually able to read a résumé?
 *
 * Every provider problem — a key that was never read, a key that was
 * rejected, an account with no credit — reaches the person uploading a CV as
 * the same failed import. Told apart only by guessing, that difference cost a
 * day. This asks each provider directly and says which one, if any, will
 * answer.
 *
 * Nothing here returns a key or any part of one: the variable's name, whether
 * it is set on this deployment, and what happened when it was used.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DiagnosticsPage() {
  await requireUser();
  const providers = await probeProviders();
  const usable = providers.find((provider) => provider.reachable);

  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Deployment check</div>
        <h1 className="page-title">Can Sartho read a résumé?</h1>
        <p className="page-description">
          Each AI provider is asked directly, right now. Résumé import, job matching, résumé
          tailoring and interview preparation all need one of these to answer.
        </p>
      </section>

      <section className={`glass-card content-card diagnostic-verdict ${usable ? "is-good" : "is-bad"}`}>
        <strong>
          {usable
            ? `Yes — ${usable.name} answered. Imports will use it.`
            : "No — nothing answered, so an upload cannot be read."}
        </strong>
        <p>
          {usable
            ? "Nothing further is needed. Upload a résumé and it will be read."
            : "Every provider below either has no key on this deployment or refused the request. Fix one of them and the whole product works."}
        </p>
        {usable ? <Link href="/career-truth" className="primary-button">Upload a résumé <span aria-hidden="true">→</span></Link> : null}
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Providers, in the order they are tried</h2>
            <p className="section-subtitle">
              The free one leads, so a deployment holding several spends nothing it does not have to.
            </p>
          </div>
        </div>

        <ul className="diagnostic-list">
          {providers.map((provider) => (
            <li key={provider.name} className={`diagnostic-row ${provider.reachable ? "is-ok" : provider.configured ? "is-failed" : "is-absent"}`}>
              <span className="diagnostic-mark" aria-hidden="true">
                {provider.reachable ? "✓" : provider.configured ? "✕" : "—"}
              </span>
              <span className="diagnostic-body">
                <strong>{provider.name}</strong>
                <small>{provider.detail}</small>
                {/* The provider's own words — the summary above cannot
                    distinguish an empty account from a project without billing
                    enabled, and whoever is fixing it needs to know which. */}
                {provider.raw && provider.raw !== provider.detail ? (
                  <code className="diagnostic-raw">{provider.raw}</code>
                ) : null}
              </span>
              <code className="diagnostic-env">{provider.envVar}</code>
            </li>
          ))}
        </ul>

        <p className="diagnostic-note">
          A dash means no key is set on this deployment — check the name character for character
          in Vercel, and remember an environment variable only reaches a deployment created after
          it was saved.
        </p>
      </section>
    </div>
  );
}
