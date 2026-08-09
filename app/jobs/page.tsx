import Link from "next/link";
import { JobAnalyser } from "@/components/job-analyser";
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

  // The matcher has no career of its own; it reads roles against this one.
  const skillProfile = buildSkillProfile(workspace.evidence, workspace.roles);
  const activeSources = searchPreferences.sources.filter((source) => source.active).length;
  const strongMatches = jobs.filter((job) => job.recommendation === "apply").length;

  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Opportunity workspace</div>
        <h1 className="page-title">Opportunities</h1>
        <p className="page-description">
          Bring in a role, understand why it fits, save the worthwhile ones and carry each decision forward without losing the evidence behind it.
        </p>
        <div className="hero-actions profile-header-actions">
          <Link href="#analyse" className="primary-button">Add and analyse a role <span aria-hidden="true">↓</span></Link>
          <Link href="/search-plan" className="secondary-button">Review search strategy</Link>
        </div>
        <div className="summary-grid opportunity-summary-grid">
          <Summary label="Saved opportunities" value={String(jobs.length)} />
          <Summary label="Strong signals" value={String(strongMatches)} />
          <Summary label="Active sources" value={String(activeSources)} />
          <Summary label="Target locations" value={String(searchPreferences.targetLocations.length)} />
        </div>
      </section>
      <div id="analyse"><JobAnalyser initialJobs={jobs} skillProfile={skillProfile} /></div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}
