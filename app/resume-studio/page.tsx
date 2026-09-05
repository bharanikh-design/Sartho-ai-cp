import { ProductPageHeader } from "@/components/product-page-header";
import { ResumeStudio, type StudioDraft, type TailorableRole } from "@/components/resume-studio";
import { requireUser } from "@/lib/auth";
import { getJobs } from "@/lib/data/jobs";
import type { ApplicationRecord, ResumeVersionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * Résumé Studio: make a résumé, and check how it reads to an applicant
 * tracking system. Two things.
 *
 * What used to be here as well — a three-step workflow tracker, a queue of
 * saved roles whose analysis was unfinished, and a second copy of the résumé
 * upload and source-document library already on Career Truth — was opportunity
 * and profile work wearing a résumé label. It has gone back where it belongs.
 */
export default async function ResumeStudioPage() {
  const { supabase, user } = await requireUser();
  const [jobs, applicationsResult, approvedResult, versionsResult] = await Promise.all([
    getJobs(supabase, user.id),
    supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .not("resume_draft", "is", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("approval_status", "approved")
      .eq("safe_for_resume", true),
    supabase
      .from("resume_versions")
      .select("*")
      .eq("user_id", user.id)
      .order("version_number", { ascending: false }),
  ]);

  if (applicationsResult.error) throw applicationsResult.error;
  if (approvedResult.error) throw approvedResult.error;
  /*
   * History is additive: if the table is not there yet the page still works,
   * it just shows the current draft on its own.
   */
  const versions = (versionsResult.data ?? []) as ResumeVersionRecord[];
  const versionsByJob = new Map<string, ResumeVersionRecord[]>();
  for (const version of versions) {
    const list = versionsByJob.get(version.job_id) ?? [];
    list.push(version);
    versionsByJob.set(version.job_id, list);
  }

  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const applications = (applicationsResult.data ?? []) as ApplicationRecord[];

  const drafts: StudioDraft[] = applications.map((application) => {
    const job = jobById.get(application.job_id);
    return {
      application,
      jobId: application.job_id,
      jobTitle: job?.title ?? "Tailored résumé",
      employer: job?.employer ?? null,
      /* The ATS check reads the advert's own requirement vocabulary from here. */
      analysis: job?.rule_analysis ?? null,
      history: versionsByJob.get(application.job_id) ?? [],
    };
  });

  const draftedJobIds = new Set(applications.map((application) => application.job_id));
  /*
   * Only roles the drafting route will actually accept. Offering a role it
   * would reject is a dead button, and listing the ones that still need
   * analysis is the chase list this page is no longer allowed to be.
   */
  const tailorable: TailorableRole[] = jobs
    .filter((job) => job.deep_analysis_status === "complete" && !draftedJobIds.has(job.id))
    .map((job) => ({ id: job.id, title: job.title, employer: job.employer }));

  return (
    <div className="page-stack resume-studio-page">
      <ProductPageHeader
        eyebrow="Prepare · Résumé"
        title="Write the résumé, then see how a filter will read it."
        description="Every draft is built only from career facts you approved, and every material change is logged. The ATS check compares the draft against the requirement wording of the role it was written for."
        metric={{ value: applications.length, label: "tailored drafts" }}
      />

      <ResumeStudio
        drafts={drafts}
        tailorable={tailorable}
        hasAnyJobs={jobs.length > 0}
        evidenceReady={(approvedResult.count ?? 0) > 0}
      />
    </div>
  );
}
