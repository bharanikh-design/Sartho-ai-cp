import { DailyDigestSettings } from "@/components/daily-digest-settings";
import { MatchAlertSettings } from "@/components/match-alert-settings";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { digestHealth } from "@/lib/notifications/digest-health";
import { isEmailDeliveryConfigured } from "@/lib/notifications/send-email";

export const dynamic = "force-dynamic";

/*
 * Every email Sartho can send, in one place: the daily match alert from the
 * saved search brief, and the daily summary of the pipeline. Neither belongs
 * on the page whose job is to show matching roles.
 */
export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("notification_preferences")
    .select("email,daily_digest_enabled,last_sent_at,updated_at,match_alerts_enabled,match_alerts_last_run_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const email = (typeof data?.email === "string" && data.email) || user.email || "";
  const deliveryReady = isEmailDeliveryConfigured();

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Email alerts"
        title="What Sartho emails you, and when."
        description="Two emails, both opt-in. Nothing is sent unless you turn it on here."
      />
      <MatchAlertSettings
        initialEmail={email}
        initialEnabled={Boolean(data?.match_alerts_enabled)}
        deliveryReady={deliveryReady}
        lastRunAt={typeof data?.match_alerts_last_run_at === "string" ? data.match_alerts_last_run_at : null}
      />
      <DailyDigestSettings
        initialEmail={email}
        initialEnabled={Boolean(data?.daily_digest_enabled)}
        deliveryReady={deliveryReady}
        health={digestHealth({
          enabled: Boolean(data?.daily_digest_enabled),
          /* The only real evidence that the schedule is running. */
          lastSentAt: typeof data?.last_sent_at === "string" ? data.last_sent_at : null,
          /*
           * The closest thing to "when was this switched on". It is the row's
           * last change of any kind, so it can only ever make the check more
           * forgiving — the right direction for a claim that the deployment
           * is broken.
           */
          enabledSince: typeof data?.updated_at === "string" ? data.updated_at : null,
        })}
      />
    </div>
  );
}
