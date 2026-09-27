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
import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata("Find Roles", "Find live job listings matched against your approved evidence.", "/search-plan");

export default async function SearchPlanPage() {
  const { supabase, user } = await requireUser();
  const [lanes, preferences, journey, profileResult, stored] = await Promise.all([
    getTargetLanes(supabase, user.id),
    getSearchPreferences(supabase, user.id),
    loadProductJourneyStatus(supabase, user.id),
    supabase.from("profiles").select("country,total_experience_years").eq("id", user.id).maybeSingle(),
    // The last search, so arriving here is normally a read rather than a provider call.
    getStoredSearch(supabase, user.id),
  ]);

  const inferredCountry = normaliseCountryCode(
    typeof profileResult.data?.country === "string" ? profileResult.data.country : null,
  );
  /*
   * The résumé's own total, offered as a starting answer rather than used as
   * one. It is read off an imported document and is often wrong or missing, and
   * it decides which roles are hidden — so the person gets to see the number,
   * see where it came from, and correct it.
   */
  const resumeYears = typeof profileResult.data?.total_experience_years === "number"
    ? profileResult.data.total_experience_years
    : null;
  const country = normaliseCountryCode(preferences.country);
  const split = splitMisfiledCompanies(preferences.targetLocations, preferences.targetCompanies);
  /*
   * A stored search is only usable while it still answers the question that
   * was asked of it.
   *
   * `directEmployersOnly` decides which listings a run keeps, so a row
   * written under one setting cannot describe the other — and it is narrowed
   * rather than annotated, so the listings it left out are simply not there
   * to show. Handing it over after the toggle moved would display the wrong
   * set and, worse, a note telling the person to switch to the mode they are
   * already in.
   *
   * Withholding it is all that is needed: the panel treats "no stored
   * results" as its cue to run a fresh search on arrival, which is the only
   * thing that can widen a set that was narrowed at write time.
   */
  const sourcesChanged = Boolean(stored)
    && (stored!.criteria.directEmployersOnly ?? false) !== (preferences.directEmployersOnly ?? false);
  const usableStored = sourcesChanged ? null : stored;

  const briefReady = Boolean(country ?? inferredCountry) && lanes.length > 0 && isJobSearchConfigured();

  return (
    <div className="page-stack product-page">
      <JourneySteps journey={journey} currentId="search" />
      <ProductPageHeader
        eyebrow="Step 3 of 3 · Find roles"
        title="Roles that match your brief"
        description="Live listings for your target roles, scored against your approved evidence."
        metric={{ value: lanes.length || "—", label: "target roles", href: "/career-direction#priorities" }}
      />
      <SearchPlanEditor
        initialSources={preferences.sources}
        initialCountries={preferences.countries.length ? preferences.countries : country ? [country] : []}
        inferredCountry={inferredCountry}
        initialExperience={preferences.experienceLevel}
        resumeYears={resumeYears}
        initialEmploymentTypes={preferences.employmentTypes}
        initialLocations={split.locations}
        initialCompanies={split.companies}
        initialRemotePreferences={preferences.remotePreferences}
        initialDirectEmployersOnly={preferences.directEmployersOnly ?? false}
        targetLanes={lanes}
        movedCompanies={split.moved}
      />
      <JobSearchPanel
        autoRun={briefReady}
        initialResults={usableStored?.results ?? []}
        initialCriteria={usableStored?.criteria ?? null}
        searchedAt={usableStored?.searchedAt ?? null}
      />
    </div>
  );
}
