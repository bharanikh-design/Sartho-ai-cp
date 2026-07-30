import { careerProfile, evidenceItems } from "@/data/profile";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden p-8">
        <div className="muted text-sm">Career command centre</div>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Find work worthy of your experience.
        </h1>
        <p className="muted mt-5 max-w-2xl text-base leading-7">
          Sartho turns verified career evidence into focused job discovery, honest fit analysis,
          tailored applications and outcome tracking.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Verified evidence" value={String(evidenceItems.length)} note="Awaiting approval" />
        <Metric label="Target role lanes" value="3" note="Leadership first" />
        <Metric label="Automatic submissions" value="0" note="Human approval required" />
      </section>

      <section className="panel p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="muted text-xs uppercase tracking-[0.2em]">Current positioning</div>
            <h2 className="mt-2 text-2xl font-semibold">{careerProfile.headline}</h2>
          </div>
          <div className="muted text-sm">{careerProfile.experienceYears}+ years · {careerProfile.location}</div>
        </div>
        <div className="mt-6 grid gap-3">
          {careerProfile.targetLanes.map((lane) => (
            <div key={lane.name} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex justify-between gap-4 text-sm">
                <span>{lane.name}</span><span className="muted">{lane.weight}%</span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-white/10">
                <div className="h-1.5 rounded-full bg-white" style={{ width: `${lane.weight}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel p-5">
      <div className="muted text-sm">{label}</div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      <div className="muted mt-2 text-xs">{note}</div>
    </div>
  );
}
