import { JobAnalyser } from "@/components/job-analyser";
import { ChromeExtensionBanner } from "@/components/chrome-extension-banner";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { getJobs } from "@/lib/data/jobs";
import { getSearchPreferences } from "@/lib/data/search";
import { buildSkillProfile } from "@/lib/matching/skill-profile";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const { supabase, user } = await requireUser();
  const [jobs, workspace, searchPreferences] = await Promise.all([
    getJobs(supabase, user.id),
    getCareerWorkspace(supabase, user.id),
    getSearchPreferences(supabase, user.id),
  ]);

  const skillProfile = buildSkillProfile(workspace.evidence, workspace.roles);
  const activeSources = searchPreferences.sources.filter((source) => source.active).length;
  const strongMatches = jobs.filter((job) => job.recommendation === "apply").length;

  return (
    <div className="page-stack">
      <ProductPageHeader
        eyebrow="Recurring workflow · Assess fit"
        title="Job Analyzer"
        description="Sartho acts as your personal recruiter. Paste a job description below to instantly cross-reference it with your Master Resume. Understand your fit, spot missing skills, and save the role for tailoring."
        metric={{ value: jobs.length, label: "saved opportunities" }}
        actions={[
          { href: "/search-plan", label: "Review search brief" },
        ]}
      />
      
      <section className="summary-grid opportunity-summary-grid" aria-label="Opportunity summary">
        <Summary label="Saved opportunities" value={String(jobs.length)} />
        <Summary label="Strong rule-based signals" value={String(strongMatches)} />
        <Summary label="Sources selected" value={String(activeSources)} />
        <Summary label="Target locations" value={String(searchPreferences.targetLocations.length)} />
      </section>
      
      <ChromeExtensionBanner />
      <div id="analyse"><JobAnalyser initialJobs={jobs} skillProfile={skillProfile} /></div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}
