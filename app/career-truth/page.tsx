import { EvidenceReview } from "@/components/evidence-review";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";

export const dynamic = "force-dynamic";

export default async function CareerTruthPage() {
  const { supabase, user } = await requireUser();
  const { profile, lanes, evidence } = await getCareerWorkspace(supabase, user.id);

  const approved = evidence.filter((item) => item.approval_status === "approved").length;
  const rejected = evidence.filter((item) => item.approval_status === "rejected").length;
  const pending = evidence.length - approved - rejected;

  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Career foundation</div>
        <h1 className="page-title">Career Profile</h1>
        <p className="page-description">
          The factual source behind every match, résumé and interview answer. Sartho uses only evidence you approve and never invents a skill, metric, employer, certification or responsibility.
        </p>

        <div className="summary-grid">
          <Summary label="Evidence records" value={String(evidence.length)} />
          <Summary label="Approved for use" value={String(approved)} />
          <Summary label="Awaiting review" value={String(pending)} />
        </div>
      </section>

      {!profile ? (
        <section className="glass-card empty-ledger">
          <div className="empty-ledger-inner">
            <div className="empty-ledger-icon" aria-hidden="true">◎</div>
            <h3>Your private Career Profile is ready to be loaded</h3>
            <p>
              The application no longer reads personal career information from source code. Run the one-time private seed in Supabase to load your profile, target lanes and evidence into your protected account.
            </p>
          </div>
        </section>
      ) : (
        <section className="glass-card content-card profile-overview-card">
          <div className="card-header">
            <div>
              <div className="page-eyebrow">Current positioning</div>
              <h2 className="position-title">{profile.headline ?? "Career positioning"}</h2>
              {profile.summary ? <p className="section-subtitle profile-summary">{profile.summary}</p> : null}
            </div>
            <span className="meta-pill">
              {profile.total_experience_years ? `${profile.total_experience_years}+ years` : "Experience profile"}
              {profile.location ? ` · ${profile.location}` : ""}
            </span>
          </div>

          <div className="profile-facts-grid">
            <div><span>Work authorisation</span><strong>{profile.work_authorisation ?? "Not recorded"}</strong></div>
            <div><span>Approved evidence</span><strong>{approved} records</strong></div>
            <div><span>Honest exclusions</span><strong>{profile.exclusions.length} guardrails</strong></div>
          </div>
        </section>
      )}

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Target role strategy</h2>
            <p className="section-subtitle">Leadership first. Platforms support your value; they do not define your entire identity.</p>
          </div>
          <span className="meta-pill">{lanes.reduce((total, lane) => total + lane.weight, 0)}% search allocation</span>
        </div>

        {lanes.length ? (
          <div className="strategy-grid">
            {lanes.map((lane, index) => (
              <article key={lane.id} className="strategy-card">
                <span className="strategy-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{lane.name}</h3>
                <footer><span>Priority lane</span><strong>{lane.weight}%</strong></footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-inline-state">No target role lanes are configured yet.</div>
        )}
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Career evidence review</h2>
            <p className="section-subtitle">Approve, edit or reject every claim before Sartho can use it. Focus a card and press A to approve or R to reject.</p>
          </div>
          <span className={`status-chip ${pending ? "status-pending" : "status-approved"}`}>
            {pending ? `${pending} pending` : "Review complete"}
          </span>
        </div>

        <EvidenceReview initialItems={evidence} />
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}
