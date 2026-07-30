import { ApplicationLedger } from "@/components/application-ledger";
import { requireUser } from "@/lib/auth";
import { getJobs } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();
  const jobs = await getJobs(supabase, user.id);

  return (
    <div className="page-stack">
      <section className="glass-card page-header-card">
        <div className="page-eyebrow"><span className="live-dot" /> Outcome ledger</div>
        <h1 className="page-title">Applications</h1>
        <p className="page-description">
          One factual timeline for every opportunity, résumé version, acknowledgement, assessment, interview and outcome. Nothing is submitted without your approval.
        </p>
      </section>

      <ApplicationLedger initialJobs={jobs} />
    </div>
  );
}
