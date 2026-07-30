import { careerProfile, evidenceItems } from "@/data/profile";

export default function CareerTruthPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="muted text-sm">Foundation</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Career Truth</h1>
        <p className="muted mt-3 max-w-3xl leading-7">
          Every match, résumé and application answer must be grounded in evidence you have approved. Sartho never invents a skill, metric, certification or responsibility.
        </p>
      </header>

      <section className="panel p-6">
        <h2 className="text-xl font-semibold">Target role strategy</h2>
        <div className="mt-4 grid gap-3">
          {careerProfile.targetLanes.map((lane, index) => (
            <div key={lane.name} className="flex items-center gap-4 rounded-2xl border border-white/10 p-4">
              <div className="flex size-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-black">{index + 1}</div>
              <div className="flex-1"><div className="font-medium">{lane.name}</div></div>
              <div className="muted text-sm">{lane.weight}%</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Evidence awaiting approval</h2>
            <p className="muted mt-1 text-sm">Approval actions will be connected after authentication and database setup.</p>
          </div>
          <div className="muted text-sm">{evidenceItems.length} items</div>
        </div>
        <div className="mt-5 grid gap-4">
          {evidenceItems.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium">{item.employer} · {item.role}</div>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">Needs approval</span>
              </div>
              <p className="mt-4 text-lg leading-7">{item.claim}</p>
              <div className="muted mt-4 text-sm">{item.metrics.join(" · ")}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.domains.map((domain) => <span key={domain} className="rounded-full bg-white/8 px-3 py-1 text-xs">{domain}</span>)}
              </div>
              <div className="muted mt-4 border-t border-white/10 pt-4 text-xs">
                Source: {item.source} · {item.sourceLocator}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
