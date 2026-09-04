import { CareerProfileReview } from "@/components/career-profile-review";
import { ProductPageHeader } from "@/components/product-page-header";
import { ResumeImport } from "@/components/resume-import";
import { CareerHistory } from "@/components/career-history";
import { JourneySteps } from "@/components/journey-steps";
import { ProfileSnapshotEditor } from "@/components/profile-snapshot-editor";
import { WorkflowHandoff } from "@/components/workflow-handoff";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

export default async function CareerTruthPage() {
  const { supabase, user } = await requireUser();
  const [{ profile, lanes, roles, evidence }, journey] = await Promise.all([
    getCareerWorkspace(supabase, user.id),
    loadProductJourneyStatus(supabase, user.id),
  ]);
  const isEmpty = evidence.length === 0;
  const usableEvidence = evidence.filter((item) => item.approval_status !== "rejected");
  const pending = usableEvidence.filter((item) => item.approval_status === "pending").length;
  const approved = usableEvidence.filter((item) => item.approval_status === "approved").length;
  const confirmed = approved > 0 && pending === 0;
  const strengths = Array.from(new Set(usableEvidence.flatMap((item) => item.domains))).slice(0, 8);
  const positioning = profile?.headline?.trim() || profile?.summary?.trim() || "Your confirmed career story";

  if (isEmpty) {
    return (
      <div className="page-stack">
        <JourneySteps journey={journey} currentId="resume" />
        <ProductPageHeader
          eyebrow="Step 1 of 4 · Add your résumé"
          title="Bring in your career story."
          description="Upload one strong source résumé. AI organises it into a profile; you review the result before anything is used."
        />
        <section className="glass-card content-card" id="resume">
          <div className="card-header">
            <div><h2 className="section-heading">Upload your master résumé</h2><p className="section-subtitle">PDF, Word or plain text. Your document remains the source of truth.</p></div>
            <span className="status-chip status-pending">Step 1</span>
          </div>
          <ResumeImport hasEvidence={false} />
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack career-profile-page">
      <JourneySteps journey={journey} currentId="confirm" />
      <ProductPageHeader
        eyebrow={confirmed ? "Career Profile · Confirmed" : "Step 2 of 4 · Confirm your profile"}
        title={confirmed ? positioning : "Confirm your Career Profile"}
        description={confirmed
          ? "This is the career evidence Sartho uses for direction suggestions, opportunity matching and preparation."
          : "Review what AI organised from your résumé. Correct uncertain details, then confirm the profile once."}
        metric={{ value: confirmed ? approved : pending, label: confirmed ? "approved career facts" : "items need review" }}
        actions={confirmed ? [
          { href: "/resume-studio#source-resumes", label: "Manage source résumés" },
        ] : []}
      />

      {profile ? (
        <ProfileSnapshotEditor
          profile={profile}
          lanes={lanes}
          roleCount={roles.length}
          displayStrengths={strengths}
        />
      ) : null}

      <CareerProfileReview initialItems={evidence} roles={roles} profile={profile} />

      <section className="glass-card content-card" id="career-history">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Career history</h2>
            <p className="section-subtitle">Your complete timeline from the source résumé.</p>
          </div>
          <span className="meta-pill">{roles.length} role{roles.length === 1 ? "" : "s"}</span>
        </div>
        <CareerHistory roles={roles} evidence={evidence} />
      </section>

      {confirmed ? (
        <WorkflowHandoff
          eyebrow="Next · Career Direction"
          title="Your profile is complete. Now choose where you want to go."
          description="AI will suggest direct, adjacent and stretch paths from this confirmed evidence. You decide which roles enter your priorities."
          reason="Career Direction turns a record of your past into an intentional next move."
          href="/career-direction"
          label="Continue to Career Direction"
        />
      ) : null}
    </div>
  );
}
