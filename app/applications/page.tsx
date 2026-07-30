const statuses = ["Saved", "Analysed", "Approved", "Applied", "Acknowledged", "Assessment", "Interview", "Offer / Rejected"];

export default function ApplicationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="muted text-sm">Outcome ledger</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Applications</h1>
        <p className="muted mt-3 max-w-3xl leading-7">One factual timeline for every role, résumé version, confirmation and next action.</p>
      </header>
      <section className="panel p-6">
        <div className="grid gap-3 md:grid-cols-4">
          {statuses.map((status) => (
            <div key={status} className="rounded-2xl border border-white/10 p-4">
              <div className="muted text-xs uppercase tracking-wide">{status}</div>
              <div className="mt-3 text-2xl font-semibold">0</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
