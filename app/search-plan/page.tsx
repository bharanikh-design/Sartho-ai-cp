import { SearchPlanEditor } from "@/components/search-plan-editor";
import { JobSearchPanel } from "@/components/job-search-panel";
import { MatchAlertSettings } from "@/components/match-alert-settings";
import { ProductPageHeader } from "@/components/product-page-header";
import { JourneySteps } from "@/components/journey-steps";
import { requireUser } from "@/lib/auth";
import { getTargetLanes } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { normaliseCountryCode } from "@/lib/jobs/countries";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";
import { isEmailDeliveryConfigured } from "@/lib/notifications/send-email";

export const dynamic = "force-dynamic";

export default async function SearchPlanPage() {
  const { supabase, user } = await requireUser();
  const [lanes, preferences, journey, profileResult, notificationResult] = await Promise.all([
    getTargetLanes(supabase, user.id),
    getSearchPreferences(supabase, user.id),
    loadProductJourneyStatus(supabase, user.id),
    supabase.from("profiles").select("country").eq("id", user.id).maybeSingle(),
    supabase.from("notification_preferences").select("email,match_alerts_enabled,match_alerts_last_run_at").eq("user_id", user.id).maybeSingle(),
  ]);
  const inferredCountry = normaliseCountryCode(
    typeof profileResult.data?.country === "string" ? profileResult.data.country : null,
  );
  const notification = notificationResult.data;

  return (
    <div className="page-stack product-page">
      <JourneySteps journey={journey} currentId="search" />
      <ProductPageHeader
        eyebrow="Step 3 of 3 · Search brief"
        title="Where should Sartho look?"
        description="Set your country, cities, target companies and work model, then search live listings — Sartho scores each match against your approved evidence."
        metric={{ value: lanes.length || "—", label: "target roles", href: "/career-direction" }}
      />
      <SearchPlanEditor
        initialSources={preferences.sources}
        initialCountry={normaliseCountryCode(preferences.country)}
        inferredCountry={inferredCountry}
        initialLocations={preferences.targetLocations}
        initialCompanies={preferences.targetCompanies}
        initialRemote={preferences.remotePreference ?? "Flexible"}
        targetLanes={lanes}
      />
      <JobSearchPanel />
      <MatchAlertSettings
        initialEmail={(typeof notification?.email === "string" && notification.email) || user.email || ""}
        initialEnabled={Boolean(notification?.match_alerts_enabled)}
        deliveryReady={isEmailDeliveryConfigured()}
        lastRunAt={typeof notification?.match_alerts_last_run_at === "string" ? notification.match_alerts_last_run_at : null}
      />
    </div>
  );
}
