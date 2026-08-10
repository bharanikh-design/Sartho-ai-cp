import { SearchPlanEditor } from "@/components/search-plan-editor";
import { ProductPageHeader } from "@/components/product-page-header";
import { WorkflowHandoff } from "@/components/workflow-handoff";
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
  const activeSources = preferences.sources.filter((source) => source.active).length;
  const briefReady = lanes.length > 0
    && preferences.targetLocations.length > 0
    && activeSources > 0
    && Boolean(preferences.remotePreference);

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Step 4 of 4 · Set your search brief"
        title="Define what a worthwhile opportunity looks like."
        description="Save the locations, work model and sources you trust. This brief guides analysis and future source integrations; Sartho does not yet fetch roles from these sources automatically."
        metric={{ value: lanes.length || "—", label: "target profiles" }}
      />
      <SearchPlanEditor
        initialSources={preferences.sources}
        initialLocations={preferences.targetLocations}
        initialRemote={preferences.remotePreference ?? "Flexible"}
        targetLanes={lanes}
      />
      <WorkflowHandoff
        eyebrow={briefReady ? "Foundation complete" : "After you save"}
        title={briefReady ? "Bring in the first opportunity worth considering." : "Your opportunity workflow begins here next."}
        description={briefReady ? "Sartho will compare its requirements with your confirmed Career Profile, show rule-based signals first and offer a deeper generative-AI mapping when you ask for it." : "Complete and save the brief above. Sartho will then use the same locations, work model and source context for each opportunity decision."}
        reason={briefReady ? "Your search brief now gives each opportunity decision the same context and constraints." : "A complete brief prevents each role from being assessed against a different, unstated set of preferences."}
        href={briefReady ? "/jobs" : "#profiles"}
        label={briefReady ? "Open opportunities" : "Complete the brief"}
      />
    </div>
  );
}
