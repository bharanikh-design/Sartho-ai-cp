import { SearchPlanEditor } from "@/components/search-plan-editor";
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
      <header className="product-page-heading"><div><span>Your opportunity coverage</span><h1>Search Strategy</h1><p>Control the profiles, locations, work model and trusted sources that define a worthwhile opportunity.</p></div><aside><strong>{lanes.length || "—"}</strong><span>target profiles</span></aside></header>
      <SearchPlanEditor
        initialSources={preferences.sources}
        initialLocations={preferences.targetLocations}
        initialRemote={preferences.remotePreference ?? "Flexible"}
        targetLanes={lanes}
      />
    </div>
  );
}
