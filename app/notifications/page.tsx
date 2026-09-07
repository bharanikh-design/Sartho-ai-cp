import { EmailSettings } from "@/components/email-settings";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { digestHealth } from "@/lib/notifications/digest-health";
import { isEmailDeliveryConfigured } from "@/lib/notifications/send-email";

export const dynamic = "force-dynamic";

/*
 * Every email Sartho can send, as two switches: the daily match alert from the
 * saved search brief, and the daily summary of the pipeline.
 *
 * Both used to be full cards with their own address field, checkbox and Save
 * button — two screens for four facts. The address is one column shared by
 * both, so it is asked for once.
 */
export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("notification_preferences")
    .select("email,daily_digest_enabled,last_sent_at,updated_at,match_alerts_enabled,match_alerts_last_run_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const email = (typeof data?.email === "string" && data.email) || user.email || "";
  const digestEnabled = Boolean(data?.daily_digest_enabled);
  const matchAlertsEnabled = Boolean(data?.match_alerts_enabled);
  const matchAlertsLastRun = typeof data?.match_alerts_last_run_at === "string" ? data.match_alerts_last_run_at : null;

  const digest = digestHealth({
    enabled: digestEnabled,
    /* The only real evidence that the schedule is running. */
    lastSentAt: typeof data?.last_sent_at === "string" ? data.last_sent_at : null,
    /*
     * The closest thing to "when was this switched on". It is the row's last
     * change of any kind, so it can only ever make the check more forgiving —
     * the right direction for a claim that the deployment is broken.
     */
    enabledSince: typeof data?.updated_at === "string" ? data.updated_at : null,
  });

  /*
   * Match alerts get the same treatment the digest already had, and for the
   * same reason: the last run is the one piece of evidence that the schedule
   * reaches Sartho at all. Rendered on the server because it compares a stored
   * timestamp against "now", and the server's now and the browser's now are
   * different numbers.
   */
  const matchAlerts = digestHealth({
    enabled: matchAlertsEnabled,
    lastSentAt: matchAlertsLastRun,
    enabledSince: typeof data?.updated_at === "string" ? data.updated_at : null,
    noun: "match alert",
  });

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Email alerts"
        title="What Sartho emails you."
        description="Both are off until you turn them on. Nothing else is ever sent."
      />
      <EmailSettings
        initialEmail={email}
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
