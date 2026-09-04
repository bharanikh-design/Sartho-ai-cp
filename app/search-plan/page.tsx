import { SearchPlanEditor } from "@/components/search-plan-editor";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getTargetLanes } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";

export const dynamic = "force-dynamic";

export default async function SearchPlanPage() {
  const { supabase, user } = await requireUser();
  const [lanes, preferences] = await Promise.all([
    getTargetLanes(supabase, user.id),
    getSearchPreferences(supabase, user.id),
  ]);

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Step 4 of 4 · Search brief"
        title="Where should Sartho look?"
        description="Set your locations, work model and trusted sources — the context Sartho uses to judge each opportunity."
        metric={{ value: lanes.length || "—", label: "target roles", href: "/career-direction" }}
      />
      <SearchPlanEditor
        initialSources={preferences.sources}
        initialLocations={preferences.targetLocations}
        initialRemote={preferences.remotePreference ?? "Flexible"}
        targetLanes={lanes}
      />
    </div>
  );
}
