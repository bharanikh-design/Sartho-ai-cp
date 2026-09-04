import Link from "next/link";
import { CareerProfileReview } from "@/components/career-profile-review";
import { ProductPageHeader } from "@/components/product-page-header";
import { ResumeImport } from "@/components/resume-import";
import { CareerHistory } from "@/components/career-history";
import { VectorSyncEngine } from "@/components/vector-sync-engine";
import { WorkflowHandoff } from "@/components/workflow-handoff";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";

export const dynamic = "force-dynamic";

export default async function CareerTruthPage() {
  const { supabase, user } = await requireUser();
  const { profile, roles, evidence } = await getCareerWorkspace(supabase, user.id);
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
        <ProductPageHeader
          eyebrow="Step 1 of 4 · Add your résumé"
          title="Bring in your career story."
          description="Upload one strong source résumé. AI organises it into a profile; you review the result before anything is used."
        />
        <VectorSyncEngine />
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
      <VectorSyncEngine />

      {profile ? (
        <section className="glass-card profile-record" aria-labelledby="profile-record-title">
          <div className="profile-record__heading">
            <div><p className="product-system-eyebrow">Professional snapshot</p><h2 id="profile-record-title">{positioning}</h2></div>
            <Link href="/career-direction#context">Edit snapshot →</Link>
          </div>
          {profile.headline && profile.summary && profile.headline.trim() !== profile.summary.trim() ? <p className="profile-record__summary">{profile.summary}</p> : null}
          <div className="profile-record__facts">
            <div><span>Location</span><strong>{profile.location ?? "Not recorded"}</strong></div>
            <div><span>Work rights and mobility</span><strong>{profile.work_authorisation ?? "Not recorded"}</strong></div>
            <div><span>Career history</span><strong>{roles.length} role{roles.length === 1 ? "" : "s"}</strong></div>
          </div>
          <div className="profile-record__strengths">
            <span>Leading strengths</span>
            <div>{strengths.length ? strengths.map((strength) => <strong key={strength}>{strength}</strong>) : <em>No strengths recorded yet</em>}</div>
          </div>
        </section>
      ) : null}

      <CareerProfileReview initialItems={evidence} roles={roles} profile={profile} />

      <details className="glass-card profile-history-disclosure" id="career-history">
        <summary><span><strong>Career history</strong><small>Your complete timeline from the source résumé</small></span><span>{roles.length} roles <b aria-hidden="true">⌄</b></span></summary>
        <div className="profile-history-disclosure__content"><CareerHistory roles={roles} evidence={evidence} /></div>
      </details>

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
