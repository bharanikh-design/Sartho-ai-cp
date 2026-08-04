import { JobAnalyser } from "@/components/job-analyser";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { getJobs } from "@/lib/data/jobs";
import { buildSkillProfile } from "@/lib/matching/skill-profile";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const { supabase, user } = await requireUser();
  const [jobs, workspace] = await Promise.all([
    getJobs(supabase, user.id),
    getCareerWorkspace(supabase, user.id),
  ]);

  // The matcher has no career of its own; it reads roles against this one.
  const skillProfile = buildSkillProfile(workspace.evidence, workspace.roles);

  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Decision engine</div>
        <h1 className="page-title">Analyse a Role</h1>
        <p className="page-description">
          Understand the opportunity before spending time on it. Start with transparent rule-based screening, save the role, then run evidence-led deep analysis against your approved Career Profile.
        </p>
      </section>
      <JobAnalyser initialJobs={jobs} skillProfile={skillProfile} />
    </div>
  );
}
