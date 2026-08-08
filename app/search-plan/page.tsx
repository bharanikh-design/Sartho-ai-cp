import { SearchPlanEditor, type SearchSource } from "@/components/search-plan-editor";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SearchPlanPage() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("search_preferences").select("target_locations,remote_preference,sources").eq("user_id", user.id).maybeSingle();
  if (error && error.code !== "PGRST116") throw error;

  return (
    <div className="page-stack product-page">
      <header className="product-page-heading"><div><span>Where Sartho looks</span><h1>Search Plan</h1><p>Control target locations and trusted opportunity sources before Sartho begins discovery.</p></div><aside><strong>Private</strong><span>your preferences</span></aside></header>
      <SearchPlanEditor initialSources={Array.isArray(data?.sources) ? data.sources as SearchSource[] : []} initialLocations={data?.target_locations ?? []} initialRemote={data?.remote_preference ?? "Flexible"} />
    </div>
  );
}
