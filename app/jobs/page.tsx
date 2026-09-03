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

  const skillProfile = buildSkillProfile(workspace.evidence, workspace.roles);
  
  return (
    <div className="page-stack" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      {/* Hyper-clear Header */}
      <div style={{ marginBottom: "2rem", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "2rem" }}>
        <h1 style={{ fontSize: "2.5rem", margin: "0 0 1rem", letterSpacing: "-0.02em" }}>Job Analyzer</h1>
        <p style={{ fontSize: "1.1rem", color: "#aaa", maxWidth: "800px", lineHeight: 1.6 }}>
          Sartho acts as your personal recruiter. Whenever you find a job you like on LinkedIn, Indeed, or a company website, <strong>paste the Job Description below</strong>. 
          Sartho will instantly cross-reference it with your resume, tell you if you're a strong match, and help you tailor your application.
        </p>
      </div>

      <JobAnalyser initialJobs={jobs} skillProfile={skillProfile} />
    </div>
  );
}
