import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { ResumeImport } from "@/components/resume-import";
import { ResumeLibrary } from "@/components/resume-library";
import { ResumeStudioWorkspace } from "@/components/resume-studio-workspace";
import { requireUser } from "@/lib/auth";
import { getResumeImports } from "@/lib/data/career";
import { getJobs } from "@/lib/data/jobs";
import type { ApplicationRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ResumeStudioPage() {
  const { supabase, user } = await requireUser();
  const [jobs, applicationsResult, approvedResult, imports] = await Promise.all([
    getJobs(supabase, user.id),
    supabase.from("applications").select("*").eq("user_id", user.id).not("resume_draft", "is", null).order("updated_at", { ascending: false }),
    supabase.from("evidence_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("approval_status", "approved").eq("safe_for_resume", true),
    getResumeImports(supabase, user.id),
  ]);

  if (applicationsResult.error) throw applicationsResult.error;
  if (approvedResult.error) throw approvedResult.error;

  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const applications = (applicationsResult.data ?? []) as ApplicationRecord[];
  const draftedJobIds = new Set(applications.map((application) => application.job_id));
  const readyJobs = jobs.filter((job) => job.deep_analysis_status === "complete" && !draftedJobIds.has(job.id));
  const jobsNeedingAnalysis = jobs.filter((job) => job.deep_analysis_status !== "complete" && !draftedJobIds.has(job.id));
  const approvedCount = approvedResult.count ?? 0;

  return (
    <div className="page-stack resume-studio-page">
      <ProductPageHeader
        eyebrow="Prepare · Résumé"
        title="Turn one analysed role into one truthful résumé draft."
        description="Choose the role first. Generative AI then builds a separate draft using only the career facts you approved and shows every material change for review."
        metric={{ value: applications.length, label: "tailored drafts" }}
        actions={[{ href: "/jobs", label: "Open opportunities" }]}
      />

      <ResumeStudioWorkspace
        profileReady={approvedCount > 0}
        readyJobs={readyJobs}
        jobsNeedingAnalysis={jobsNeedingAnalysis}
        draftCount={applications.length}
      />

      {applications.length ? (
        <section className="glass-card resume-existing-drafts">
          <div className="resume-section-heading"><div><span>Your outputs</span><h2>Tailored résumé drafts</h2><p>Each version stays attached to its role and keeps the AI change log.</p></div><strong>{applications.length}</strong></div>
          <div className="resume-version-list">
            {applications.map((application) => {
              const job = jobById.get(application.job_id);
              return (
                <Link href={`/jobs/${application.job_id}`} className="resume-version-row" key={application.id}>
                  <div><span>Draft — review before use</span><strong>{application.resume_version ?? job?.title ?? "Tailored résumé"}</strong><small>{job?.employer ?? "Employer not recorded"} · {application.resume_change_log.length} change-log entries</small></div>
                  <span aria-hidden="true">Review →</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="glass-card resume-source-drawer" id="source-resumes" style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "16px" }}>
          <div>
            <h2 style={{ margin: "0 0 8px 0", color: "white", fontSize: "1.25rem" }}>Update Master Evidence</h2>
            <p style={{ margin: 0, color: "#aaa", fontSize: "0.875rem", maxWidth: "600px" }}>
              <strong>Sartho does not use static resumes.</strong> It dynamically generates them based on your Master Career Profile. 
              If you want to add new skills or history, upload a source document here. We will extract the facts and update your Master Profile.
            </p>
          </div>
          <Link href="/career-truth" className="secondary-button" style={{ textDecoration: "none" }}>Review Master Profile →</Link>
        </div>
        
        <div className="resume-source-content" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
          <div className="resume-source-upload">
            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "0.75rem", color: "#6bcf93", textTransform: "uppercase", letterSpacing: "0.05em" }}>Step 1: Ingest</span>
              <h3 style={{ margin: "4px 0 8px 0", fontSize: "1.1rem" }}>Upload source material</h3>
            </div>
            <ResumeImport hasEvidence={imports.length > 0} showLead={false} continueHref="/career-truth#profile-review" />
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: "32px" }}>
             <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "0.75rem", color: "#6bcf93", textTransform: "uppercase", letterSpacing: "0.05em" }}>History</span>
              <h3 style={{ margin: "4px 0 8px 0", fontSize: "1.1rem" }}>Source Documents Library</h3>
            </div>
            <ResumeLibrary imports={imports} />
          </div>
        </div>
      </section>
    </div>
  );
}
