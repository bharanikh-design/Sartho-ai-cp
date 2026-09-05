import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { ResumeImport } from "@/components/resume-import";
import { ResumeLibrary } from "@/components/resume-library";
import { JourneySteps } from "@/components/journey-steps";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace, getResumeImports } from "@/lib/data/career";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

/*
 * Step 1 — Upload résumé.
 *
 * An uploaded résumé is taken as approved and final: Sartho reads it straight
 * into the approved career evidence, with no line-by-line confirmation and no
 * separate "career story" page. This screen is only the upload and a plain
 * confirmation of what was captured, then it points on to Career Direction.
 */
export default async function UploadResumePage() {
  const { supabase, user } = await requireUser();
  const [{ roles, evidence }, journey, imports] = await Promise.all([
    getCareerWorkspace(supabase, user.id),
    loadProductJourneyStatus(supabase, user.id),
    getResumeImports(supabase, user.id),
  ]);
  const approved = evidence.filter((item) => item.approval_status === "approved").length;
  const hasEvidence = evidence.length > 0;

  return (
    <div className="page-stack">
      <JourneySteps journey={journey} currentId="resume" />
      <ProductPageHeader
        eyebrow="Step 1 of 3 · Upload your résumé"
        title="Start with your résumé."
        description="Upload one strong source résumé. Sartho reads every role and achievement straight into your approved career evidence — no line-by-line confirmation."
        metric={hasEvidence ? { value: approved, label: "approved career facts" } : undefined}
      />

      <section className="glass-card content-card" id="resume">
        <div className="card-header">
          <div>
            <h2 className="section-heading">{hasEvidence ? "Add or replace your résumé" : "Upload your master résumé"}</h2>
            <p className="section-subtitle">PDF, Word or plain text. Your document remains the source of truth.</p>
          </div>
          {hasEvidence
            ? <span className="meta-pill">{roles.length} role{roles.length === 1 ? "" : "s"} · {approved} fact{approved === 1 ? "" : "s"}</span>
            : <span className="status-chip status-pending">Step 1</span>}
        </div>
        <ResumeImport hasEvidence={hasEvidence} continueHref="/career-direction" />
      </section>

      {/*
        * The documents themselves, kept where they were uploaded. This list used
        * to sit on Résumé Studio behind a second copy of the upload form, which
        * put profile work on a page meant for writing and checking a résumé.
        */}
      {imports.length ? (
        <section className="glass-card content-card" id="source-resumes">
          <div className="card-header">
            <div>
              <h2 className="section-heading">Source documents</h2>
              <p className="section-subtitle">Every résumé you have handed over, kept — so a claim can point at the document it came from.</p>
            </div>
            <span className="meta-pill">{imports.length} document{imports.length === 1 ? "" : "s"}</span>
          </div>
          <ResumeLibrary imports={imports} />
        </section>
      ) : null}

      {hasEvidence ? (
        <div className="direction-save-bar">
          <Link href="/career-direction" className="primary-button">
            Continue to Career Direction <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
