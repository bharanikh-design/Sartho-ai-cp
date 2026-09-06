import Link from "next/link";
import { notFound } from "next/navigation";
import { isOperationsAdmin, requireUser } from "@/lib/auth";
import { getCachedProviderHealth } from "@/lib/ai/diagnostics";
import { deliveryDiagnostics } from "@/lib/notifications/delivery-diagnostics";
import { ProductPageHeader } from "@/components/product-page-header";

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
  const delivery = deliveryDiagnostics();

  return (
    <div className="page-stack">
      <ProductPageHeader
        eyebrow="Operations · AI provider health"
        title="Can Sartho read a résumé?"
        description={<>The active provider is checked directly and the result is cached for five minutes. Standbys never receive career data until an operator activates them. Last checked {new Date(checkedAt).toLocaleString("en-GB")}.</>}
        metric={{ value: usable ? "Ready" : "Paused", label: "AI processing" }}
      />

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

      {/*
        * Scheduled email is the one feature that gives no sign when it breaks:
        * no error, no email, and an email that does not arrive is exactly what
        * a quiet day looks like. So the chain is laid out rather than left to
        * be inferred from an absence nobody investigates.
        */}
      <section className={`glass-card content-card diagnostic-verdict ${delivery.ready ? "is-good" : "is-bad"}`}>
        <strong>
          {delivery.ready
            ? "Scheduled email can run — every part of the chain is configured."
            : "Scheduled email cannot run on this deployment."}
        </strong>
        <p>
          {delivery.remedy
            ?? "The daily summary and match alerts will send on their schedules. Whether a given person receives one is shown on their own notifications page."}
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Scheduled email</h2>
            <p className="section-subtitle">
              Every one of these must be set. Missing any of them produces the same symptom — nothing arrives — which is why they are listed separately rather than as one verdict.
            </p>
          </div>
        </div>

        <ul className="diagnostic-list">
          {delivery.requirements.map((requirement) => (
            <li key={requirement.envVar} className={`diagnostic-row ${requirement.present ? "is-ok" : "is-failed"}`}>
              <span className="diagnostic-mark" aria-hidden="true">{requirement.present ? "✓" : "✕"}</span>
              <span className="diagnostic-body">
                <strong>{requirement.present ? "Set" : "Not set"}</strong>
                <small>{requirement.purpose}</small>
              </span>
              <code className="diagnostic-env">{requirement.envVar}</code>
            </li>
          ))}
        </ul>

        <ul className="diagnostic-list">
          {delivery.jobs.map((job) => (
            <li key={job.path} className="diagnostic-row is-absent">
              <span className="diagnostic-mark" aria-hidden="true">◷</span>
              <span className="diagnostic-body">
                <strong>{job.name}</strong>
                <small>{job.plainEnglish}</small>
                <small>{job.path}</small>
              </span>
              <code className="diagnostic-env">{job.schedule}</code>
            </li>
          ))}
        </ul>

        <p className="diagnostic-note">
          A schedule being listed here means it is deployed, not that it ran. Whether it actually
          reached somebody is recorded per person, and stated on their notifications page — that
          timestamp is the only real evidence, and the reason it is now shown.
        </p>
      </section>
    </div>
  );
}
