import { CareerDirectionEditor } from "@/components/career-direction-editor";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";

export const dynamic = "force-dynamic";

export default async function CareerDirectionPage() {
  const { supabase, user } = await requireUser();
  const { profile, lanes, evidence } = await getCareerWorkspace(supabase, user.id);
  const suggestedStrengths = Array.from(new Set(evidence.flatMap((item) => item.domains))).slice(0, 16);

  return (
    <div className="page-stack product-page">
      <header className="product-page-heading"><div><span>Where you can go next</span><h1>Career Direction</h1><p>Shape the strengths, roles and priorities Sartho should use when looking for your next move.</p></div><aside><strong>{lanes.length || "—"}</strong><span>target profiles</span></aside></header>
      <CareerDirectionEditor initialProfile={profile} initialLanes={lanes} suggestedStrengths={suggestedStrengths} />
    </div>
  );
}
