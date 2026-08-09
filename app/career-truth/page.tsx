import Link from "next/link";
import { CareerProfileReview } from "@/components/career-profile-review";
import { ResumeImport } from "@/components/resume-import";
import { CareerHistory } from "@/components/career-history";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";

export const dynamic = "force-dynamic";

export default async function CareerTruthPage() {
  const { supabase, user } = await requireUser();
  const { profile, lanes, roles, evidence } = await getCareerWorkspace(supabase, user.id);
  const isEmpty = evidence.length === 0;
  const pending = evidence.filter((item) => item.approval_status === "pending").length;
  const strengths = new Set(evidence
    .filter((item) => item.approval_status !== "rejected")
    .flatMap((item) => item.domains));

  if (isEmpty) {
    return (
      <div className="page-stack">
        <section className="glass-card page-header-card profile-entry-header">
          <div className="page-eyebrow"><span className="live-dot" /> Start your career foundation</div>
          <h1 className="page-title">Bring in your résumé</h1>
          <p className="page-description">Upload your strongest résumé. Sartho will turn it into a concise Career Profile you can review in one sitting.</p>
        </section>
        <section className="glass-card content-card" id="resume">
          <div className="card-header">
            <div>
              <h2 className="section-heading">Upload your master résumé</h2>
              <p className="section-subtitle">PDF, Word or plain text. The document remains your source; Sartho organises what it contains.</p>
            </div>
            <span className="status-chip status-pending">Step 1</span>
          </div>
          <ResumeImport hasEvidence={false} />
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack career-profile-page">
      <section className="glass-card page-header-card profile-entry-header">
        <div className="page-eyebrow"><span className="live-dot" /> Your professional foundation</div>
        <h1 className="page-title">Career Profile</h1>
        <p className="page-description">A clear, editable picture of your career—not a list of database records. Confirm it once, then use it to guide opportunities, résumés and interviews.</p>

        <div className="hero-actions profile-header-actions">
          <Link href="/career-direction" className="secondary-button">Edit career direction</Link>
          <Link href="/resume-studio#source-resumes" className="secondary-button">Manage source résumés</Link>
        </div>

        <div className="profile-summary-strip" aria-label="Career profile summary">
          <div><span>Experience</span><strong>{profile?.total_experience_years ? `${profile.total_experience_years}+ years` : `${roles.length} roles`}</strong></div>
          <div><span>Career history</span><strong>{roles.length} role{roles.length === 1 ? "" : "s"}</strong></div>
          <div><span>Strength signals</span><strong>{strengths.size}</strong></div>
          <div><span>Profile status</span><strong>{pending ? "Ready to confirm" : "Confirmed"}</strong></div>
        </div>
      </section>

      {profile ? (
        <section className="glass-card content-card profile-overview-card">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Professional snapshot</div>
              <h2 className="position-title">{profile.headline ?? "Career positioning"}</h2>
              {profile.summary ? <p className="section-subtitle profile-summary">{profile.summary}</p> : null}
            </div>
            <Link href="/career-direction#context" className="profile-text-action">Edit snapshot <span>→</span></Link>
          </div>

          <div className="profile-facts-grid">
            <div><span>Current location</span><strong>{profile.location ?? "Not recorded"}</strong></div>
            <div><span>Work authorisation and mobility</span><strong>{profile.work_authorisation ?? "Not recorded"}</strong></div>
            <div><span>Search guardrails</span><strong>{profile.exclusions.length ? `${profile.exclusions.length} preferences recorded` : "No exclusions recorded"}</strong></div>
          </div>
        </section>
      ) : null}

      <CareerProfileReview initialItems={evidence} />

      <section className="glass-card content-card" id="career-history">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Career history</h2>
            <p className="section-subtitle">Your professional timeline, organised from the résumé you supplied.</p>
          </div>
          <span className="meta-pill">{roles.length} role{roles.length === 1 ? "" : "s"}</span>
        </div>
        <CareerHistory roles={roles} evidence={evidence} />
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Target profile strategy</h2>
            <p className="section-subtitle">The role families Sartho will prioritise after your profile is confirmed.</p>
          </div>
          <Link href="/career-direction#priorities" className="profile-text-action">Edit priorities <span>→</span></Link>
        </div>

        {lanes.length ? (
          <div className="strategy-grid">
            {lanes.map((lane, index) => (
              <article key={lane.id} className="strategy-card">
                <span className="strategy-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{lane.name}</h3>
                <footer><span>Search priority</span><strong>{lane.weight}%</strong></footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="profile-next-action">
            <div><strong>No target profiles chosen yet</strong><span>After confirming this profile, choose and rank the roles you want Sartho to pursue.</span></div>
            <Link href="/career-direction#priorities" className="primary-button">Choose target profiles <span>→</span></Link>
          </div>
        )}
      </section>
    </div>
  );
}
