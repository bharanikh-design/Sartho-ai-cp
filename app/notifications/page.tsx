import { EmailSettings } from "@/components/email-settings";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { loadNotificationAddress } from "@/lib/notifications/address";
import { summariseAddress } from "@/lib/notifications/address-response";
import { digestHealth } from "@/lib/notifications/digest-health";
import { isEmailDeliveryConfigured } from "@/lib/notifications/send-email";

export const dynamic = "force-dynamic";

/*
 * Every email Sartho can send, as two switches: the daily match alert from the
 * saved search brief, and the daily summary of the pipeline.
 *
 * One address serves both, and it has to have said yes: the account's own
 * sign-in address counts as having done so, anything else is sent a link.
 * The row is read with the person's own client, which can still see it; the
 * writes all happen server-side on the routes, with the service role.
 */
export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const address = await loadNotificationAddress(supabase, user.id);

  const digestEnabled = address?.digestEnabled ?? false;
  const matchAlertsEnabled = address?.matchAlertsEnabled ?? false;

  const digest = digestHealth({
    enabled: digestEnabled,
    /* The only real evidence that the schedule is running. */
    lastSentAt: address?.lastSentAt ?? null,
    /*
     * The closest thing to "when was this switched on". It is the row's last
     * change of any kind, so it can only ever make the check more forgiving —
     * the right direction for a claim that the deployment is broken.
     */
    enabledSince: address?.updatedAt ?? null,
  });

  /*
   * Match alerts get the same treatment, and for the same reason: the last
   * run is the one piece of evidence that the schedule reaches Sartho at all.
   * Rendered on the server because it compares a stored timestamp against
   * "now", and the server's now and the browser's now are different numbers.
   */
  const matchAlerts = digestHealth({
    enabled: matchAlertsEnabled,
    lastSentAt: address?.matchAlertsLastRunAt ?? null,
    enabledSince: address?.updatedAt ?? null,
    noun: "match alert",
  });

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Email alerts"
        title="What Sartho emails you."
        description="Both are off until you turn them on. Nothing else is ever sent, and nothing is sent to an address that hasn't said yes."
      />
      <EmailSettings
        accountEmail={user.email ?? null}
        address={summariseAddress(address)}
        matchAlertsEnabled={matchAlertsEnabled}
        digestEnabled={digestEnabled}
        deliveryReady={isEmailDeliveryConfigured()}
        matchAlertsStatus={matchAlertsEnabled ? matchAlerts.message : null}
        matchAlertsConcerning={matchAlerts.concerning}
        digestStatus={digest.message}
        digestConcerning={digest.concerning}
      />
    </div>
  );
}
