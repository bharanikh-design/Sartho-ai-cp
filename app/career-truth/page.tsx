import Link from "next/link";
import { EvidenceReview } from "@/components/evidence-review";
import { ResumeImport } from "@/components/resume-import";
import { SkillSet } from "@/components/skill-set";
import { requireUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { buildSkillProfile } from "@/lib/matching/skill-profile";

export const dynamic = "force-dynamic";

export default async function CareerTruthPage() {
  const { supabase, user } = await requireUser();
  const { profile, lanes, roles, evidence } = await getCareerWorkspace(supabase, user.id);

  const approved = evidence.filter((item) => item.approval_status === "approved").length;
  const rejected = evidence.filter((item) => item.approval_status === "rejected").length;
  const pending = evidence.length - approved - rejected;

  /*
   * Order follows the journey, not the data model.
   *
   * With nothing in the evidence base, every section on this page is empty and
   * the one action that matters — putting a career in — was sitting fourth,
   * underneath things that cannot be done yet. When there is nothing to review,
   * the import comes first and the rest waits its turn.
   */
  const isEmpty = evidence.length === 0;
  const skillProfile = buildSkillProfile(evidence, roles);

  const importCard = (
    <section className="glass-card content-card">
      <div className="card-header">
        <div>
          <h2 className="section-heading">{isEmpty ? "Start here — bring your career in" : "Add another résumé"}</h2>
          <p className="section-subtitle">Sartho reads your résumé and records what it says — it never writes anything you did not.</p>
        </div>
        {isEmpty ? <span className="status-chip status-pending">Step 1</span> : null}
      </div>

      <ResumeImport hasEvidence={!isEmpty} />
    </section>
  );

  const reviewCard = (
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
  );

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

      <CareerJourney
        uploaded={evidence.length > 0}
        approvedCount={approved}
        pendingCount={pending}
      />

      {isEmpty ? importCard : null}

      {profile ? (
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
      ) : null}

      {isEmpty ? null : reviewCard}

      {isEmpty ? null : (
        <section className="glass-card content-card">
          <div className="card-header">
            <div>
              <h2 className="section-heading">Your skill set</h2>
              <p className="section-subtitle">
                Built from the evidence you approved, not from what anyone claims about themselves. Each skill shows what backs it.
              </p>
            </div>
            <span className="meta-pill">
              {skillProfile.skills.length} skill{skillProfile.skills.length === 1 ? "" : "s"} from {skillProfile.totalApproved} approved claim{skillProfile.totalApproved === 1 ? "" : "s"}
            </span>
          </div>

          <SkillSet profile={skillProfile} />
        </section>
      )}

      {/*
        * Target lanes describe how to weight a search. That is a question worth
        * asking once there is something to search with, and noise before it.
        */}
      {isEmpty ? null : (
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
      )}

      {isEmpty ? null : importCard}
    </div>
  );
}

/*
 * The four steps, and which one you are on.
 *
 * Each stage of this product depends on the one before it, and none of that was
 * visible anywhere — the pages simply sat empty until the right thing happened
 * somewhere else, with nothing saying what the right thing was.
 */
function CareerJourney({
  uploaded,
  approvedCount,
  pendingCount,
}: {
  uploaded: boolean;
  approvedCount: number;
  pendingCount: number;
}) {
  const steps = [
    {
      title: "Upload your résumé",
      detail: uploaded ? "Read and recorded" : "Sartho reads every role and achievement out of it",
      done: uploaded,
      current: !uploaded,
      href: null,
    },
    {
      title: "Approve what is true",
      detail: approvedCount
        ? `${approvedCount} approved — your skill set is built from these`
        : pendingCount
          ? `${pendingCount} claim${pendingCount === 1 ? "" : "s"} waiting for you`
          : "Nothing is used until you say yes",
      done: approvedCount > 0 && pendingCount === 0,
      current: uploaded && pendingCount > 0,
      href: null,
    },
    {
      title: "Analyse a role",
      detail: approvedCount ? "Paste a job description and see how you actually match" : "Needs approved evidence first",
      done: false,
      current: approvedCount > 0,
      href: approvedCount ? "/jobs" : null,
    },
    {
      title: "Tailor and prepare",
      detail: "A résumé built only from evidence you approved, and answers to match",
      done: false,
      current: false,
      href: approvedCount ? "/resume-studio" : null,
    },
  ];

  return (
    <section className="glass-card content-card career-journey">
      <div className="card-header">
        <div>
          <h2 className="section-heading">How Sartho works</h2>
          <p className="section-subtitle">Each step needs the one before it. Nothing runs on evidence you have not approved.</p>
        </div>
      </div>

      <ol className="journey-steps">
        {steps.map((step, index) => {
          const state = step.done ? "is-done" : step.current ? "is-current" : "";
          const body = (
            <>
              <span className="journey-number" aria-hidden="true">{step.done ? "✓" : index + 1}</span>
              <span className="journey-text">
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </span>
            </>
          );

          return (
            <li key={step.title} className={`journey-step ${state}`}>
              {step.href ? <Link href={step.href} className="journey-link">{body}</Link> : <span className="journey-link">{body}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}
