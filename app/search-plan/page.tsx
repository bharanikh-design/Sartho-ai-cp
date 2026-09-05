import { SearchPlanEditor } from "@/components/search-plan-editor";
import { JobSearchPanel } from "@/components/job-search-panel";
import { ProductPageHeader } from "@/components/product-page-header";
import { JourneySteps } from "@/components/journey-steps";
import { requireUser } from "@/lib/auth";
import { getTargetLanes } from "@/lib/data/career";
import { getSearchPreferences } from "@/lib/data/search";
import { normaliseCountryCode } from "@/lib/jobs/countries";
import { splitMisfiledCompanies } from "@/lib/jobs/employers";
import { isJobSearchConfigured } from "@/lib/jobs/search-provider";
import { getStoredSearch } from "@/lib/jobs/run-search";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

/*
 * Search Brief is the roles that match. The criteria card above them is short
 * on purpose — four questions — and email alerts live on their own page.
 */
export default async function SearchPlanPage() {
  const { supabase, user } = await requireUser();
  const [lanes, preferences, journey, profileResult, stored] = await Promise.all([
    getTargetLanes(supabase, user.id),
    getSearchPreferences(supabase, user.id),
    loadProductJourneyStatus(supabase, user.id),
    supabase.from("profiles").select("country").eq("id", user.id).maybeSingle(),
    // The last search, so arriving here shows matches without re-querying.
    getStoredSearch(supabase, user.id),
  ]);
  const inferredCountry = normaliseCountryCode(
    typeof profileResult.data?.country === "string" ? profileResult.data.country : null,
  );
  const country = normaliseCountryCode(preferences.country);
  const split = splitMisfiledCompanies(preferences.targetLocations, preferences.targetCompanies);
  const briefReady = Boolean(country ?? inferredCountry) && lanes.length > 0 && isJobSearchConfigured();

  return (
    <div className="page-stack product-page">
      <JourneySteps journey={journey} currentId="search" />
      <ProductPageHeader
        eyebrow="Step 3 of 3 · Search brief"
        title="Roles that match your brief"
        description="Live listings for your target roles, scored against your approved evidence."
        metric={{ value: lanes.length || "—", label: "target roles", href: "/career-direction#priorities" }}
      />
      <SearchPlanEditor
        initialSources={preferences.sources}
        initialCountries={preferences.countries.length ? preferences.countries : country ? [country] : []}
        inferredCountry={inferredCountry}
        initialEmploymentTypes={preferences.employmentTypes}
        initialLocations={split.locations}
        initialCompanies={split.companies}
        initialRemote={preferences.remotePreference ?? "Flexible"}
        targetLanes={lanes}
        movedCompanies={split.moved}
      />
      <JobSearchPanel
        autoRun={briefReady}
        initialResults={stored?.results ?? []}
        initialCriteria={stored?.criteria ?? null}
        searchedAt={stored?.searchedAt ?? null}
      />
    </div>
  );
}
