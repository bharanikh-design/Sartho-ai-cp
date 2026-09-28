import { isTerminalCause, providerLabel, type ProviderRetirement } from "@/lib/jobs/provider-cascade";
import { notifyOperatorThrottled } from "@/lib/operations/alerts";

/*
 * Telling the operator a jobs provider is out for good.
 *
 * A provider can retire from a search for two kinds of reason. A timeout or a
 * run of errors is weather, and the next search may well not see it. A missing
 * key, a spent monthly allowance or a refused key is not: every search until a
 * person acts will find the same thing, and until now the only place it was
 * written was the server log, beside a page that quietly showed shallower
 * results. The scheduled jobs already report their own failures to the
 * operator; a live search is where a provider outage is actually noticed
 * first, and it said nothing.
 *
 * Once per provider and cause per window, because the same fact does not need
 * to arrive once per search.
 */

export const PROVIDER_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

type TerminalCause = "not_configured" | "spent_allowance" | "auth";

const HEADLINE: Record<TerminalCause, string> = {
  not_configured: "has no key configured",
  spent_allowance: "has spent its allowance",
  auth: "refused its key",
};

const REMEDY: Record<TerminalCause, string> = {
  not_configured: "Set the provider's key in the deployment settings and redeploy.",
  spent_allowance:
    "Nothing to do until the allowance resets, unless the plan is raised at the provider. Searches fall back to the other configured providers until then.",
  auth: "Check the key and the subscription in the provider's dashboard, update the deployment settings and redeploy.",
};

export async function alertProviderRetirements(
  retirements: ProviderRetirement[],
  deps: { notify?: typeof notifyOperatorThrottled } = {},
): Promise<void> {
  const notify = deps.notify ?? notifyOperatorThrottled;
  for (const retirement of retirements) {
    if (!isTerminalCause(retirement.cause)) continue;
    const cause = retirement.cause as TerminalCause;
    const label = providerLabel(retirement.provider);
    try {
      await notify({
        key: `provider-retired:${retirement.provider}:${cause}`,
        windowMs: PROVIDER_ALERT_WINDOW_MS,
        subject: `Jobs provider ${label} ${HEADLINE[cause]}`,
        lines: [
          `${label} was retired from a live search because it ${HEADLINE[cause]}: ${retirement.message}`,
          REMEDY[cause],
          "Searches keep running on the remaining providers, with shallower results until this is fixed. The providers panel on the diagnostics page probes each key.",
          "This is sent at most once every six hours per provider from each running server instance.",
        ],
      });
    } catch (caught) {
      /* An alert must never cost the search that raised it. */
      console.error("Unable to raise a provider alert", { message: caught instanceof Error ? caught.message : "unknown" });
    }
  }
}
