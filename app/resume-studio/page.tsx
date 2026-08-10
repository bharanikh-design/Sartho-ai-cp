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
  const completeImports = imports.filter((item) => item.status === "complete").length;
  const failedImports = imports.filter((item) => item.status === "failed").length;

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

      <details className="glass-card resume-source-drawer" id="source-resumes">
        <summary>
          <span><strong>Source résumé library</strong><small>Upload or review the documents behind your Career Profile</small></span>
          <span className="resume-source-status">{completeImports} usable{failedImports ? ` · ${failedImports} failed attempt${failedImports === 1 ? "" : "s"}` : ""}</span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="resume-source-content">
          <div className="resume-source-upload"><div><span>Add source material</span><h2>Upload another résumé</h2><p>Sartho reconciles anything new with the Career Profile you already reviewed.</p></div><ResumeImport hasEvidence={imports.length > 0} showLead={false} continueHref="/career-truth#profile-review" /></div>
          <ResumeLibrary imports={imports} />
        </div>
      </details>
    </div>
  );
}
