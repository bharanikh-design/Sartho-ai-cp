"use client";

import { useState } from "react";
import type { GroundedInterviewPreparation } from "@/lib/interview/grounding";

export function InterviewCoachPanel({
  jobId,
  analysisComplete,
  requirementCount,
}: {
  jobId: string;
  analysisComplete: boolean;
  requirementCount: number;
}) {
  const [preparation, setPreparation] = useState<GroundedInterviewPreparation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (running || !analysisComplete) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/interview-prep`, { method: "POST" });
      const result = await response.json() as { preparation?: GroundedInterviewPreparation; error?: string };
      if (!response.ok || !result.preparation) {
        throw new Error(result.error ?? "AI could not create interview coaching.");
      }
      setPreparation(result.preparation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI could not create interview coaching.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="glass-card content-card interview-coach-panel" id="interview-coach">
      <div className="card-header">
        <div>
          <div className="page-eyebrow">Generative AI · Interview coaching</div>
          <h2 className="section-heading">Practise the questions this role is likely to test.</h2>
          <p className="section-subtitle">Sartho uses this role&apos;s requirements and only your approved Career Profile evidence. It gives you a speaking plan, not a fabricated script.</p>
        </div>
        <span className="meta-pill">{requirementCount} mapped requirements</span>
      </div>

      {!preparation ? (
        <div className="interview-coach-start">
          <div>
            <strong>{analysisComplete ? "Your role analysis is ready" : "Complete the Career Profile match first"}</strong>
            <span>{analysisComplete ? "Generate role-specific questions, answer structure and overclaim warnings." : "Interview coaching needs the mapped requirements and evidence citations from deep analysis."}</span>
          </div>
          <button type="button" className="primary-button" onClick={() => void generate()} disabled={running || !analysisComplete}>
            {running ? "Building your interview plan…" : "Generate interview coaching"} <span aria-hidden="true">✦</span>
          </button>
        </div>
      ) : (
        <div className="interview-coach-results" aria-live="polite">
          <div className="interview-opening-advice"><strong>How to open your answers</strong><p>{preparation.openingAdvice}</p></div>
          <div className="interview-question-list">
            {preparation.questions.map((question, index) => (
              <article key={`${question.question}-${index}`}>
                <span className="strategy-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{question.question}</h3>
                  <p><strong>What the interviewer is testing:</strong> {question.interviewerIntent}</p>
                  <ol>{question.answerPlan.map((step) => <li key={step}>{step}</li>)}</ol>
                  {question.evidence.length ? (
                    <details>
                      <summary>{question.evidence.length} approved career fact{question.evidence.length === 1 ? "" : "s"} to use</summary>
                      <ul>{question.evidence.map((item) => <li key={item.id}>{item.claim}</li>)}</ul>
                    </details>
                  ) : <p className="field-hint">Forward-looking question — answer as a plan or judgment, not as past experience.</p>}
                  <div className="interview-caution"><strong>Avoid:</strong> {question.caution}</div>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="secondary-button" onClick={() => void generate()} disabled={running}>
            {running ? "Refreshing…" : "Generate a fresh practice set"}
          </button>
        </div>
      )}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </section>
  );
}
