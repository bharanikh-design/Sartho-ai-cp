import { JobAnalyser } from "@/components/job-analyser";

export default function JobsPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="muted text-sm">Decision engine</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Analyse a Job</h1>
        <p className="muted mt-3 max-w-3xl leading-7">
          Screen the role against Sartho&apos;s agreed career lanes and flag developer-heavy, support-led or junior positions before spending time on an application.
        </p>
      </header>
      <JobAnalyser />
    </div>
  );
}
