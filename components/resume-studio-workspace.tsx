"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobRecord } from "@/lib/types";

export function ResumeStudioWorkspace({
  profileReady,
  readyJobs,
  jobsNeedingAnalysis,
  draftCount,
}: {
  profileReady: boolean;
  readyJobs: JobRecord[];
  jobsNeedingAnalysis: JobRecord[];
  draftCount: number;
}) {
  const router = useRouter();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(jobId: string) {
    if (generatingId) return;
    setGeneratingId(jobId);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/resume`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "AI could not create the résumé draft.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI could not create the résumé draft.");
    } finally {
      setGeneratingId(null);
    }
  }

  const activeStep = !profileReady ? 1 : readyJobs.length ? 3 : jobsNeedingAnalysis.length ? 2 : 2;

  return (
    <section className="glass-card resume-workflow-card">
      <div className="resume-workflow-heading">
        <div><span>AI résumé workflow</span><h2>Create one truthful résumé for one real role.</h2><p>Choose an opportunity, let AI tailor only approved evidence, then review every change before you use it.</p></div>
        <span className="resume-draft-count"><strong>{draftCount}</strong> drafts created</span>
      </div>

      <ol className="resume-workflow-steps" aria-label="Résumé creation steps">
        <li className={profileReady ? "is-complete" : "is-current"}><span>{profileReady ? "✓" : "1"}</span><div><strong>Career Profile</strong><small>{profileReady ? "Approved evidence ready" : "Confirm your evidence"}</small></div></li>
        <li className={activeStep === 2 ? "is-current" : activeStep > 2 ? "is-complete" : ""}><span>{activeStep > 2 ? "✓" : "2"}</span><div><strong>Choose a role</strong><small>Complete the role analysis</small></div></li>
        <li className={activeStep === 3 ? "is-current" : ""}><span>3</span><div><strong>Generate and review</strong><small>AI draft with change log</small></div></li>
      </ol>

      <div className="resume-workflow-action">
        {!profileReady ? (
          <div className="resume-workflow-empty"><div><span>Next step</span><strong>Confirm your Career Profile</strong><p>AI will only use facts you have approved and marked safe for résumé use.</p></div><Link href="/career-truth" className="primary-button">Review Career Profile →</Link></div>
        ) : readyJobs.length ? (
          <div>
            <div className="resume-action-title"><div><span>Ready now</span><strong>Choose the role you want to tailor for</strong></div><small>{readyJobs.length} analysed role{readyJobs.length === 1 ? "" : "s"}</small></div>
            <div className="resume-ready-list">
              {readyJobs.map((job) => (
                <article key={job.id}>
                  <div><span>{job.employer ?? "Employer not recorded"}</span><strong>{job.title}</strong><small>{job.location ?? "Location not recorded"}</small></div>
                  <button type="button" onClick={() => void generate(job.id)} disabled={Boolean(generatingId)}>
                    {generatingId === job.id ? "AI is drafting…" : "Create tailored draft"} <span aria-hidden="true">✦</span>
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : jobsNeedingAnalysis.length ? (
          <div>
            <div className="resume-action-title"><div><span>Continue your workflow</span><strong>Finish analysing a saved role</strong></div><small>AI needs the role requirements before it can tailor truthfully.</small></div>
            <div className="resume-ready-list">
              {jobsNeedingAnalysis.slice(0, 3).map((job) => (
                <article key={job.id}>
                  <div><span>{job.employer ?? "Employer not recorded"}</span><strong>{job.title}</strong><small>Role analysis not complete</small></div>
                  <Link href={`/jobs/${job.id}`}>Complete analysis →</Link>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="resume-workflow-empty"><div><span>Start here</span><strong>Add the role you want</strong><p>Paste a complete job description. Sartho will match it to your Career Profile before drafting.</p></div><Link href="/jobs" className="primary-button">Analyse a role →</Link></div>
        )}
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
      </div>
    </section>
  );
}
