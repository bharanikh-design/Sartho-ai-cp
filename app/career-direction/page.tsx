import { CareerDirectionEditor } from "@/components/career-direction-editor";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";

export const dynamic = "force-dynamic";

export default async function CareerDirectionPage() {
  const { supabase, user } = await requireUser();
  const { profile, lanes, roles, evidence } = await getCareerWorkspace(supabase, user.id);
  const approvedEvidence = evidence.filter((item) => item.approval_status === "approved");
  const suggestedStrengths = Array.from(new Set(approvedEvidence.flatMap((item) => item.domains))).slice(0, 16);

  return (
    <div className="page-stack product-page career-direction-page">
      <ProductPageHeader
        eyebrow="Step 3 of 4 · Choose your direction"
        title="Let AI open the possibilities. You choose the path."
        description="Sartho reads your confirmed career evidence, suggests plausible next moves and explains why. Accept, edit or dismiss every suggestion, then rank the paths you want to pursue."
        metric={{ value: lanes.length || "—", label: "selected priorities" }}
      />
      <CareerDirectionEditor
        initialProfile={profile}
        initialLanes={lanes}
        suggestedStrengths={suggestedStrengths}
        evidenceCount={approvedEvidence.length}
        roleCount={roles.length}
      />
    </div>
  );
}
