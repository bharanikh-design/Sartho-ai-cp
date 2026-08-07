import Link from "next/link";
import { notFound } from "next/navigation";
import { isOperationsAdmin, requireUser } from "@/lib/auth";
import { getCachedProviderHealth } from "@/lib/ai/diagnostics";

/*
 * Is this deployment actually able to read a résumé?
 *
 * Every provider problem — a key that was never read, a key that was
 * rejected, an account with no credit — reaches the person uploading a CV as
 * the same failed import. Told apart only by guessing, that difference cost a
 * day. This asks the active provider directly and says whether it will answer.
 *
 * Nothing here returns a key or any part of one: the variable's name, whether
 * it is set on this deployment, and what happened when it was used.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DiagnosticsPage() {
  const { user } = await requireUser();
  if (!isOperationsAdmin(user)) notFound();

  const { checkedAt, providers } = await getCachedProviderHealth();
  const usable = providers.find((provider) => provider.selected && provider.reachable);

  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Deployment check</div>
        <h1 className="page-title">Can Sartho read a résumé?</h1>
        <p className="page-description">
          Active-provider health is checked directly and cached for five minutes. Standbys are
          never contacted until an operator activates them.
        </p>
        <p className="diagnostic-note">Last provider check: {new Date(checkedAt).toLocaleString("en-GB")}</p>
      </section>

      <section className={`glass-card content-card diagnostic-verdict ${usable ? "is-good" : "is-bad"}`}>
        <strong>
          {usable
            ? `Yes — ${usable.name} is active and answered.`
            : "No — the active provider did not answer, so AI work is paused."}
        </strong>
        <p>
          {usable
            ? "The deployment will use that provider exclusively until an operator changes AI_PROVIDER."
            : "Fix the provider marked active, or deliberately switch AI_PROVIDER to an approved standby."}
        </p>
        {usable ? <Link href="/career-truth" className="primary-button">Upload a résumé <span aria-hidden="true">→</span></Link> : null}
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Provider health</h2>
            <p className="section-subtitle">
              Standby keys do not receive career data unless an operator explicitly activates them.
            </p>
          </div>
        </div>

        <ul className="diagnostic-list">
          {providers.map((provider) => (
            <li key={provider.name} className={`diagnostic-row ${provider.reachable === true ? "is-ok" : provider.reachable === false ? "is-failed" : "is-absent"}`}>
              <span className="diagnostic-mark" aria-hidden="true">
                {provider.reachable === true ? "✓" : provider.reachable === false ? "✕" : "—"}
              </span>
              <span className="diagnostic-body">
                <strong>{provider.name}{provider.selected ? " · Active" : " · Standby"}</strong>
                {provider.model ? <small>Model: {provider.model}</small> : null}
                <small>{provider.detail}</small>
                {/* The provider's own words — the summary above cannot
                    distinguish an empty account from a project without billing
                    enabled, and whoever is fixing it needs to know which. */}
                {provider.raw && provider.raw !== provider.detail ? (
                  <code className="diagnostic-raw">{provider.raw}</code>
                ) : null}

                {/*
                  * "limit: 0" means no allowance was ever granted for the model
                  * this deployment asks for — not that one was spent. The fix is
                  * a different model name, and guessing at model names is what
                  * caused this, so the key was asked which ones it may call.
                  */}
                {provider.models?.length ? (
                  <span className="diagnostic-models">
                    <strong>
                      Your key has no free allowance for <code>{provider.model}</code>. It can call
                      these — set <code>GEMINI_MODEL</code> in Vercel to one of them:
                    </strong>
                    <span className="diagnostic-model-list">
                      {provider.models.map((model) => <code key={model}>{model}</code>)}
                    </span>
                  </span>
                ) : null}
              </span>
              <code className="diagnostic-env">{provider.envVar}</code>
            </li>
          ))}
        </ul>

        <p className="diagnostic-note">
          A dash means a provider is absent or intentionally untested. Adding another key does not
          activate it: AI_PROVIDER is the single routing decision, and changing it requires a new deployment.
        </p>
      </section>
    </div>
  );
}
