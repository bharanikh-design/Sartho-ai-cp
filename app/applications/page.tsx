import { ApplicationLedger } from "@/components/application-ledger";
import { JobAnalyser } from "@/components/job-analyser";
import { ChromeExtensionBanner } from "@/components/chrome-extension-banner";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { getJobs } from "@/lib/data/jobs";
import { buildSkillProfile } from "@/lib/matching/skill-profile";

export const dynamic = "force-dynamic";

import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata("Opportunities", "Track your saved roles and applications.", "/applications");

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();
  const [jobs, workspace] = await Promise.all([
    getJobs(supabase, user.id),
    getCareerWorkspace(supabase, user.id),
  ]);
  const skillProfile = buildSkillProfile(workspace.evidence, workspace.roles);

  return (
    <div className="page-stack">
      <ChromeExtensionBanner />
      <ProductPageHeader
        eyebrow="Opportunities"
        title="Every role you have kept"
        description="Add a role, see its fit against your approved evidence, then track it from decision through interview to outcome."
        metric={{ value: jobs.length, label: "tracked opportunities" }}
      />

      <section id="add-role">
        <div className="card-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h2 className="section-heading">Add &amp; analyse a role</h2>
            <p className="section-subtitle">Paste a job description — Sartho scores the fit against your approved evidence, then saves it to your pipeline below.</p>
          </div>
        </div>
        <JobAnalyser initialJobs={[]} skillProfile={skillProfile} />
      </section>

      <ApplicationLedger initialJobs={jobs} />
    </div>
  );
}
