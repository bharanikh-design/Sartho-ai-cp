import { CareerDirectionEditor } from "@/components/career-direction-editor";
import { ProductPageHeader } from "@/components/product-page-header";
import { JourneySteps } from "@/components/journey-steps";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

export default async function CareerDirectionPage() {
  const { supabase, user } = await requireUser();
  const [{ profile, lanes, roles, evidence }, journey, suggestionSet] = await Promise.all([
    getCareerWorkspace(supabase, user.id),
    loadProductJourneyStatus(supabase, user.id),
    // The stored set: reading it is what stops a page visit spending allowance.
    supabase
      .from("direction_suggestion_sets")
      .select("suggestions,steering,dismissed")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const approvedEvidence = evidence.filter((item) => item.approval_status === "approved");
  const suggestedStrengths = Array.from(new Set(approvedEvidence.flatMap((item) => item.domains))).slice(0, 16);

  return (
    <div className="page-stack product-page career-direction-page">
      <JourneySteps journey={journey} currentId="direction" />
      <ProductPageHeader
        eyebrow="Step 2 of 3 · Choose your direction"
        title="Let AI open the possibilities. You choose the path."
        description="Two ways in: take a role AI found in your résumé, or type the one you already want. Both land in your priority list, which drives every search."
        metric={{ value: lanes.length || "—", label: "selected priorities", href: "#priorities" }}
      />
      <CareerDirectionEditor
        initialProfile={profile}
        initialLanes={lanes}
        suggestedStrengths={suggestedStrengths}
        evidenceCount={approvedEvidence.length}
        roleCount={roles.length}
        initialSuggestions={Array.isArray(suggestionSet.data?.suggestions) ? suggestionSet.data.suggestions : []}
        initialDismissed={Array.isArray(suggestionSet.data?.dismissed) ? suggestionSet.data.dismissed : []}
        initialSteering={typeof suggestionSet.data?.steering === "string" ? suggestionSet.data.steering : ""}
      />
    </div>
  );
}
