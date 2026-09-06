import { redirect } from "next/navigation";
import { ProductPageHeader } from "@/components/product-page-header";
import { UserActivityTable } from "@/components/user-activity-table";
import { requireUser, isOperationsAdmin } from "@/lib/auth";
import { loadUserTable } from "@/lib/analytics/load-user-table";
import { summariseUserTable } from "@/lib/analytics/user-table";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * Who is using Sartho, and how far they get.
 *
 * The page used to show four totals and two panels that could not answer a
 * question about anybody in particular. One of those panels reported "Supabase
 * ● Healthy, OpenAI ● Healthy, Vercel ● Healthy" as three hardcoded strings —
 * it had no connection to any of them and would have said the same thing during
 * a total outage. The other pointed at the Vercel dashboard for time-on-site,
 * which measures a different thing and attributes it to nobody.
 *
 * Both are gone. Provider health is genuinely checked, by asking the provider,
 * on /diagnostics; time spent is genuinely measured, per person, and shown here.
 */

export default async function AdminDashboardPage() {
  const { user } = await requireUser();
  if (!isOperationsAdmin(user)) redirect("/");

  let rows: Awaited<ReturnType<typeof loadUserTable>>["rows"] = [];
  let truncated = false;
  let loadError: string | null = null;

  try {
    const loaded = await loadUserTable();
    rows = loaded.rows;
    truncated = loaded.truncated;
  } catch (caught) {
    /*
     * The one likely failure is a missing service-role key, and it needs to say
     * so. An empty table would read as "nobody has signed up", which is a very
     * different and much more alarming thing than a missing variable.
     */
    console.error("Unable to load the user table", caught);
    loadError = caught instanceof Error && /administrator configuration/i.test(caught.message)
      ? "SUPABASE_SERVICE_ROLE_KEY is not set on this deployment, so accounts cannot be read. Add it in the deployment settings and redeploy."
      : "Sartho could not read the account list.";
  }

  const summary = summariseUserTable(rows);

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Operations · People"
        title="Who is using Sartho"
        description="Every account, how far through the product they got, and when they were last actually here. Visible only to platform administrators."
        metric={{ value: summary.total, label: "accounts" }}
      />

      {loadError ? <div className="inline-error" role="alert">{loadError}</div> : null}

      <section className="summary-grid admin-summary-grid">
        <SummaryCard label="Active in the last 7 days" value={summary.activeLast7Days} of={summary.total} />
        <SummaryCard label="Active in the last 30 days" value={summary.activeLast30Days} of={summary.total} />
        <SummaryCard label="Uploaded a résumé" value={summary.resumeUploaded} of={summary.total} />
        <SummaryCard label="Completed all four steps" value={summary.fullyActivated} of={summary.total} />
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">The funnel, step by step</h2>
            <p className="section-subtitle">
              Where people stop is more useful than how many arrived. Each of these is derived from
              whether the work exists, not from a flag somebody remembered to set.
            </p>
          </div>
        </div>
        <ul className="admin-funnel">
          <FunnelRow label="Signed up" value={summary.total} of={summary.total} />
          <FunnelRow label="Uploaded a résumé" value={summary.resumeUploaded} of={summary.total} />
          <FunnelRow label="Completed Career Direction" value={summary.directionComplete} of={summary.total} />
          <FunnelRow label="Started a job search" value={summary.searchStarted} of={summary.total} />
          <FunnelRow label="Turned on email alerts" value={summary.notificationsOn} of={summary.total} />
        </ul>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Every account</h2>
            <p className="section-subtitle">Most recently active first.</p>
          </div>
        </div>
        <UserActivityTable rows={rows} truncated={truncated} />
      </section>
    </div>
  );
}

function SummaryCard({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {/* A count without its denominator is not a finding. */}
      <small>{of ? `of ${of}` : "no accounts yet"}</small>
    </div>
  );
}

function FunnelRow({ label, value, of }: { label: string; value: number; of: number }) {
  const share = of ? Math.round((value / of) * 100) : 0;
  return (
    <li className="admin-funnel-row">
      <span>{label}</span>
      <span className="admin-funnel-bar" aria-hidden="true">
        <span style={{ width: `${share}%` }} />
      </span>
      <strong>{value}<small>{of ? ` · ${share}%` : ""}</small></strong>
    </li>
  );
}
