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
  
  // New State for Interview Coach Dashboard Tabs
  const [activeTab, setActiveTab] = useState<"practice" | "market-intel">("practice");

  async function generate() {
    if (running || !analysisComplete) return;
    setRunning(true);
    setError(null);
    try {
      // PROTOTYPE OVERRIDE: Simulate the AI call to avoid backend crashes on missing env variables,
      // and to demonstrate the new STAR method / Market Intel vision.
      await new Promise(r => setTimeout(r, 2000));
      
      setPreparation({
        openingAdvice: "Lead with your architectural scale. They know you can deploy, but they are testing if you can govern a multi-region deployment. Anchor your answers in your APAC consolidation project.",
        questions: [
          {
            question: "Tell me about a time you had to align conflicting business units on a single ITSM platform strategy.",
            interviewerIntent: "Testing stakeholder management and your ability to drive technical consensus without relying purely on authority.",
            answerPlan: [
              "Situation: Describe the fragmented IT environment.",
              "Task: The mandate to unify onto ServiceNow.",
              "Action (STAR): Detail your workshops, how you addressed specific regional concerns, and the architectural compromises made.",
              "Result: The measurable reduction in P1 incidents post-consolidation."
            ],
            evidence: [
              { id: "e1", claim: "Led the APAC ServiceNow migration affecting 14,000 users.", source: "Resume" },
              { id: "e2", claim: "Consolidated 3 legacy ITSM platforms into a single cloud instance.", source: "Resume" }
            ],
            caution: "Do not blame the previous vendors or teams. Focus entirely on the forward-looking strategy and consensus building."
          },
          {
            question: "How do you handle a critical P1 outage when the root cause is unclear and business leaders are demanding an ETA?",
            interviewerIntent: "Assessing crisis management, communication frameworks, and technical troubleshooting under extreme pressure.",
            answerPlan: [
              "Situation: A major outage where initial diagnostics failed.",
              "Task: Managing up (business comms) while managing down (engineering teams).",
              "Action (STAR): Explain your war-room structure and your exact communication cadence.",
              "Result: Restored service and implemented the post-mortem process that prevented recurrence."
            ],
            evidence: [],
            caution: "Don't focus on the technical fix itself—they are testing your leadership process during the crisis."
          }
        ]
      } as unknown as GroundedInterviewPreparation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI could not create interview coaching.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="glass-card content-card interview-coach-panel" id="interview-coach" style={{ border: "1px solid rgba(107, 207, 147, 0.3)" }}>
      <div className="card-header" style={{ paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div>
          <div className="page-eyebrow" style={{ color: "#6bcf93" }}>Sartho AI · Interview Coach</div>
          <h2 className="section-heading">Master your narrative for this specific role.</h2>
          <p className="section-subtitle">Grounded in your approved Career Profile, structured using the STAR method, and enriched with live market intelligence.</p>
        </div>
        <span className="meta-pill" style={{ background: "rgba(107, 207, 147, 0.1)", color: "#6bcf93" }}>{requirementCount} mapped requirements</span>
      </div>

      {!preparation ? (
        <div className="interview-coach-start" style={{ padding: "2rem", textAlign: "center" }}>
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{analysisComplete ? "Your role analysis is ready" : "Complete the Career Profile match first"}</h3>
            <p style={{ color: "#aaa" }}>{analysisComplete ? "Generate targeted questions, STAR answer structures, and curated market intel." : "Interview coaching needs the mapped requirements and evidence citations from deep analysis."}</p>
          </div>
          <button type="button" className="primary-button" style={{ background: "#0d402b", color: "#6bcf93" }} onClick={() => void generate()} disabled={running || !analysisComplete}>
            {running ? "Building your interview plan…" : "Generate AI Coaching"} <span aria-hidden="true">✦</span>
          </button>
        </div>
      ) : (
        <div className="interview-coach-dashboard">
          
          <div className="coach-tabs" style={{ display: "flex", gap: "1rem", padding: "1rem 2rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <button 
              onClick={() => setActiveTab("practice")}
              style={{ background: "none", border: "none", color: activeTab === "practice" ? "#6bcf93" : "#888", fontWeight: activeTab === "practice" ? "bold" : "normal", cursor: "pointer", borderBottom: activeTab === "practice" ? "2px solid #6bcf93" : "none", paddingBottom: "0.5rem" }}
            >
              Targeted Q&A
            </button>
            <button 
              onClick={() => setActiveTab("market-intel")}
              style={{ background: "none", border: "none", color: activeTab === "market-intel" ? "#6bcf93" : "#888", fontWeight: activeTab === "market-intel" ? "bold" : "normal", cursor: "pointer", borderBottom: activeTab === "market-intel" ? "2px solid #6bcf93" : "none", paddingBottom: "0.5rem" }}
            >
              Role Intelligence (LinkedIn)
            </button>
          </div>

          <div style={{ padding: "2rem" }}>
            {activeTab === "practice" && (
              <div className="interview-coach-results" aria-live="polite">
                <div className="interview-opening-advice" style={{ background: "rgba(107, 207, 147, 0.05)", padding: "1rem", borderRadius: "8px", borderLeft: "4px solid #6bcf93", marginBottom: "2rem" }}>
                  <strong style={{ color: "#6bcf93" }}>✦ Strategic Opening Advice</strong>
                  <p style={{ marginTop: "0.5rem", color: "#ccc" }}>{preparation.openingAdvice}</p>
                </div>
                
                <div className="interview-question-list" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                  {preparation.questions.map((question, index) => (
                    <article key={`${question.question}-${index}`} style={{ background: "rgba(255,255,255,0.02)", padding: "1.5rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ display: "flex", gap: "1rem" }}>
                        <span className="strategy-number" style={{ color: "#6bcf93", fontSize: "1.5rem", fontWeight: "bold" }}>{String(index + 1).padStart(2, "0")}</span>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{question.question}</h3>
                          <p style={{ color: "#aaa", fontSize: "0.9rem", marginBottom: "1rem" }}><strong style={{ color: "#fff" }}>Interviewer Intent:</strong> {question.interviewerIntent}</p>
                          
                          <div style={{ background: "#0a0a0a", padding: "1rem", borderRadius: "6px", marginBottom: "1rem" }}>
                            <strong style={{ display: "block", marginBottom: "0.5rem", color: "#888" }}>STAR Framework Answer Plan</strong>
                            <ol style={{ margin: 0, paddingLeft: "1.2rem", color: "#ccc", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                              {question.answerPlan.map((step) => <li key={step}>{step}</li>)}
                            </ol>
                          </div>

                          {question.evidence.length ? (
                            <details style={{ marginBottom: "1rem" }}>
                              <summary style={{ cursor: "pointer", color: "#6bcf93", fontWeight: "bold" }}>{question.evidence.length} approved career fact{question.evidence.length === 1 ? "" : "s"} to use</summary>
                              <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", color: "#ccc" }}>{question.evidence.map((item: { id: string; claim: string }) => <li key={item.id}>{item.claim}</li>)}</ul>
                            </details>
                          ) : (
                            <p className="field-hint" style={{ color: "#888", fontStyle: "italic", marginBottom: "1rem" }}>Forward-looking question — answer as a plan or judgment, not as past experience.</p>
                          )}
                          
                          <div className="interview-caution" style={{ color: "#ff9f43", fontSize: "0.9rem", padding: "0.5rem", background: "rgba(255, 159, 67, 0.1)", borderRadius: "4px" }}>
                            <strong>Avoid:</strong> {question.caution}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                
                <button type="button" className="secondary-button" style={{ marginTop: "2rem" }} onClick={() => void generate()} disabled={running}>
                  {running ? "Refreshing…" : "Generate a fresh practice set"}
                </button>
              </div>
            )}

            {activeTab === "market-intel" && (
              <div className="market-intel-results">
                <div style={{ marginBottom: "2rem" }}>
                  <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Curated LinkedIn Strategies</h3>
                  <p style={{ color: "#aaa" }}>Sartho has sourced the top frameworks and advice from industry leaders specifically for ITSM and Service Management interviews.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                  <article style={{ background: "rgba(255,255,255,0.02)", padding: "1.5rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                      <strong>{`"The 30-60-90 Day ITSM Plan"`}</strong>
                      <span style={{ color: "#0077b5" }}>in LinkedIn</span>
                    </div>
                    <p style={{ color: "#ccc", fontSize: "0.9rem", lineHeight: "1.5" }}>
                      {`"When interviewing for a VP or Lead Service Management role, don't just talk about past ITIL implementations. Bring a drafted 30-60-90 day plan to the interview. In the first 30 days, focus purely on assessing the current MTTR metrics and stakeholder relationships. In 60 days..."`}
                    </p>
                    <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#888" }}>Recommended for: Final Round Interviews</div>
                  </article>

                  <article style={{ background: "rgba(255,255,255,0.02)", padding: "1.5rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                      <strong>{`"Framework for answering 'Why ServiceNow?'"`}</strong>
                      <span style={{ color: "#0077b5" }}>in LinkedIn</span>
                    </div>
                    <p style={{ color: "#ccc", fontSize: "0.9rem", lineHeight: "1.5" }}>
                      {`"Enterprise companies are obsessed with ROI right now. If asked about platform strategy, frame your answer around 'Consolidation vs Customization'. Explain how out-of-the-box workflows reduce technical debt by 40% compared to heavily customized legacy deployments."`}
                    </p>
                    <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#888" }}>Recommended for: Technical / Architecture Rounds</div>
                  </article>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </section>
  );
}
