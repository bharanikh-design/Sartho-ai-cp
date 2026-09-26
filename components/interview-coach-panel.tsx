"use client";

import { useState } from "react";
import type { GroundedInterviewPreparation } from "@/lib/interview/grounding";
import { interviewCoachBlockedReason } from "@/lib/interview/readiness";

/*
 * The interview coach, finally reachable.
 *
 * `app/api/jobs/[id]/interview-prep/route.ts` and `lib/interview/grounding.ts`
 * were written, tested and then called by nothing. Two places sent people here
 * — the Command Centre's top action when a role reaches interview stage, and
 * every row on /interview-prep — both linking to `#interview-coach`, an id
 * that existed in no markup. The page loaded, scrolled nowhere, and the
 * promise on the screen above ("Available now · grounded AI interview
 * coaching") was the only part of the feature a person ever saw.
 *
 * What the route returns is already grounded: groundInterviewPreparation drops
 * any evidence id the model cited that is not an approved record, so a
 * question either carries real evidence or carries none. This renders that
 * distinction rather than hiding it — a question with no evidence behind it is
 * labelled as judgment, because pretending otherwise is exactly the failure
 * the grounding exists to prevent.
 */

type Props = {
  jobId: string;
  analysisComplete: boolean;
  requirementCount: number;
  approvedEvidenceCount: number;
};

export function InterviewCoachPanel(props: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparation, setPreparation] = useState<GroundedInterviewPreparation | null>(null);

  const blocked = interviewCoachBlockedReason(props);

  async function prepare() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${props.jobId}/interview-prep`, { method: "POST" });
      const result = await response.json() as { preparation?: GroundedInterviewPreparation; error?: string };
      if (!response.ok || !result.preparation) {
        throw new Error(result.error ?? "Sartho could not prepare this role for interview coaching.");
      }
      setPreparation(result.preparation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not prepare this role for interview coaching.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="glass-card content-card interview-coach" id="interview-coach">
      <div className="card-header">
        <div>
          <div className="page-eyebrow">Prepare · Interview</div>
          <h2 className="section-heading">Interview coach</h2>
          <p className="section-subtitle">
            Questions built from this role&apos;s requirements and answered from evidence you have approved.
            Sartho gives you the shape of an answer to speak in your own words — never a script to memorise.
          </p>
        </div>
        {preparation ? <span className="meta-pill">{preparation.questions.length} questions</span> : null}
      </div>

      {blocked ? (
        <div className="empty-inline-state">{blocked}</div>
      ) : (
        <div className="deep-analysis-action">
          <button
            type="button"
            className="primary-button"
            onClick={() => void prepare()}
            disabled={running}
          >
            {running
              ? "Preparing your questions…"
              : preparation ? "Prepare again" : "Prepare for this interview"}
            {" "}<span aria-hidden="true">✦</span>
          </button>
          <span>
            {preparation
              ? "Re-running asks the model again and replaces what is below."
              : `Drawing on ${props.requirementCount} mapped requirement${props.requirementCount === 1 ? "" : "s"} and ${props.approvedEvidenceCount} approved record${props.approvedEvidenceCount === 1 ? "" : "s"}.`}
          </span>
        </div>
      )}

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      {preparation ? (
        <div className="interview-coach-result">
          <aside className="interview-opening">
            <span className="page-eyebrow">Before you go in</span>
            <p>{preparation.openingAdvice}</p>
          </aside>

          <div className="interview-question-list">
            {preparation.questions.map((question, index) => (
              <article className="interview-question" key={`${index}-${question.question}`}>
                <div className="interview-question-head">
                  <span className="interview-question-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{question.question}</h3>
                    <p className="interview-question-intent">
                      <strong>What they are testing:</strong> {question.interviewerIntent}
                    </p>
                  </div>
                </div>

                <div className="interview-answer-plan">
                  <span className="page-eyebrow">How to shape your answer</span>
                  <ol>
                    {question.answerPlan.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}
                  </ol>
                </div>

                {question.evidence.length ? (
                  <details className="evidence-citations">
                    <summary>
                      {question.evidence.length} approved record{question.evidence.length === 1 ? "" : "s"} to draw on
                    </summary>
                    <div>
                      {question.evidence.map((item) => <article key={item.id}><p>{item.claim}</p></article>)}
                    </div>
                  </details>
                ) : (
                  /*
                   * States what is true, and no more.
                   *
                   * This said "Judgment question — answer from how you would
                   * approach it, not from a past example", which the data does
                   * not support. An empty array has two causes that cannot be
                   * told apart here: the route's prompt does allow a
                   * forward-looking question to cite nothing, but
                   * keepGroundedIds also silently drops every id that was not
                   * an approved record — so an experience question whose
                   * citations were wrong lands in exactly this branch. Telling
                   * somebody not to use a past example for a question that is
                   * asking for one is the failure this whole product is meant
                   * to avoid: stating something it cannot evidence.
                   *
                   * The honest line covers both, and is useful either way.
                   */
                  <div className="interview-question-unevidenced">
                    <strong>Nothing from your Career Profile is attached to this one.</strong>
                    <span>
                      If it is asking how you would approach something, answer from your thinking.
                      If you reach for a past example, make sure it is one you can stand behind.
                    </span>
                  </div>
                )}

                <div className="interview-caution">
                  <strong>Watch out</strong>
                  <span>{question.caution}</span>
                </div>
              </article>
            ))}
          </div>

          <p className="interview-coach-footnote">
            These are Sartho&apos;s best guess at what this role will probe, from the advert and your Career Profile.
            Treat them as preparation, not prediction — and never claim anything here that you could not evidence in the room.
          </p>
        </div>
      ) : null}
    </section>
  );
}
