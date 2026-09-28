import Link from "next/link";
import { notFound } from "next/navigation";
import { isOperationsAdmin, requireUser } from "@/lib/auth";
import { getCachedProviderHealth } from "@/lib/ai/diagnostics";
import { deliveryDiagnostics } from "@/lib/notifications/delivery-diagnostics";
import { googleIntegrationDiagnostics } from "@/lib/integrations/google";
import { operatorAlertAddress } from "@/lib/operations/alerts";
import { recentScheduledRuns, scheduledJobsHealth, type ScheduledJobHealth } from "@/lib/operations/scheduled-runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductPageHeader } from "@/components/product-page-header";

/*
 * The run log, or the reason there is none. A missing service role and a
 * missing table are both told apart from "nothing has run", because each of
 * the three has a different fix.
 */
async function loadRunHealth(): Promise<{ jobs: ScheduledJobHealth[] } | { unavailable: string }> {
  try {
    const log = await recentScheduledRuns(createAdminClient());
    if (log.ok) return { jobs: scheduledJobsHealth(log.runs) };
    return {
      unavailable: log.reason === "missing_table"
        ? "The run log table is missing. Apply the 20260928120000_scheduled_runs migration and the jobs will start recording themselves."
        : "The run log could not be read from the database.",
    };
  } catch {
    return { unavailable: "SUPABASE_SERVICE_ROLE_KEY is not set, so the run log cannot be read." };
  }
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "never");

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
  const runHealth = await loadRunHealth();
  const alertAddress = operatorAlertAddress();
  const google = googleIntegrationDiagnostics();

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
          A schedule being listed here means it is deployed, not that it ran. What each run actually
          did is in the run log below; whether it reached a given person is stated on their own
          notifications page.
        </p>
      </section>

      {/*
        * The run log. Each job writes a row when it starts and closes it when
        * it ends, so silence can be told from success: a job that never ran
        * has no rows, and says so here rather than looking like a quiet day.
        */}
      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Scheduled runs</h2>
            <p className="section-subtitle">
              What each job did on its last run, from its own record. The same verdict is published at /api/health for an uptime monitor.
            </p>
          </div>
        </div>

        {"jobs" in runHealth ? (
          <ul className="diagnostic-list">
            {runHealth.jobs.map((job) => (
              <li key={job.job} className={`diagnostic-row ${job.state === "healthy" ? "is-ok" : job.state === "never" ? "is-absent" : "is-failed"}`}>
                <span className="diagnostic-mark" aria-hidden="true">{job.state === "healthy" ? "✓" : job.state === "never" ? "—" : "✕"}</span>
                <span className="diagnostic-body">
                  <strong>{job.label}</strong>
                  <small>{job.message}</small>
                  <small>Last run {when(job.lastRunAt)} · last success {when(job.lastSuccessAt)}</small>
                </span>
                <code className="diagnostic-env">{job.state}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="diagnostic-note">{runHealth.unavailable}</p>
        )}

        <p className="diagnostic-note">
          {alertAddress
            ? `Each run reports its failures, and the other job's silence, to ${alertAddress}.`
            : "SARTHO_ALERT_EMAIL is not set, so run failures and a silent sibling job are only written to the server log. Set it to be emailed instead."}
        </p>
      </section>

      {/*
        * The Drive integration has one requirement more than its OAuth
        * client: the key that seals every stored grant. Without it the
        * integration is off, and this is where that is said.
        */}
      <section className={`glass-card content-card diagnostic-verdict ${google.ready ? "is-good" : "is-bad"}`}>
        <strong>
          {google.ready
            ? "Google Drive can be connected — the OAuth client and the sealing key are both set."
            : "Google Drive cannot be connected on this deployment."}
        </strong>
        <p>{google.remedy ?? "Stored grants are sealed with INTEGRATION_TOKEN_KEY; the database never holds a token in the clear."}</p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Google Drive integration</h2>
            <p className="section-subtitle">Names and presence only. No value is ever shown.</p>
          </div>
        </div>

        <ul className="diagnostic-list">
          {google.requirements.map((requirement) => (
            <li key={requirement.envVar} className={`diagnostic-row ${requirement.present ? "is-ok" : "is-failed"}`}>
              <span className="diagnostic-mark" aria-hidden="true">{requirement.present ? "✓" : "✕"}</span>
              <span className="diagnostic-body">
                <strong>{requirement.present ? "Set" : requirement.problem ? "Set, but unusable" : "Not set"}</strong>
                <small>{requirement.problem ?? requirement.purpose}</small>
              </span>
              <code className="diagnostic-env">{requirement.envVar}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
