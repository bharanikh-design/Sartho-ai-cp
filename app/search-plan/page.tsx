import { SearchPlanEditor } from "@/components/search-plan-editor";
import { JobSearchPanel } from "@/components/job-search-panel";
import { ProductPageHeader } from "@/components/product-page-header";
import { JourneySteps } from "@/components/journey-steps";
import { requireUser } from "@/lib/auth";
import { getTargetLanes } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

export default async function SearchPlanPage() {
  const { supabase, user } = await requireUser();
  const [lanes, preferences, journey] = await Promise.all([
    getTargetLanes(supabase, user.id),
    getSearchPreferences(supabase, user.id),
    loadProductJourneyStatus(supabase, user.id),
  ]);

  return (
    <div className="page-stack product-page">
      <JourneySteps journey={journey} currentId="search" />
      <ProductPageHeader
        eyebrow="Step 3 of 3 · Search brief"
        title="Where should Sartho look?"
        description="Set your locations and work model, then search live listings — Sartho scores each match against your approved evidence."
        metric={{ value: lanes.length || "—", label: "target roles", href: "/career-direction" }}
      />
      <SearchPlanEditor
        initialSources={preferences.sources}
        initialLocations={preferences.targetLocations}
        initialRemote={preferences.remotePreference ?? "Flexible"}
        targetLanes={lanes}
      />
      <JobSearchPanel />
    </div>
  );
}
