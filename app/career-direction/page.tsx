import { CareerDirectionEditor } from "@/components/career-direction-editor";
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
      <header className="career-direction-header"><div><span>Career direction</span><h1>Choose where Sartho should take you next.</h1><p>Start with evidence-grounded AI suggestions, then keep only the paths that feel right to you.</p></div><aside><strong>{lanes.length}</strong><span>selected priorities</span></aside></header>
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
