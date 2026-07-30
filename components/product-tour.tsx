"use client";

import { useEffect, useMemo, useState } from "react";

type TourStep = {
  selector: string;
  title: string;
  description: string;
};

const steps: TourStep[] = [
  {
    selector: '[data-tour="analyse-role"]',
    title: "Start here: analyse a role",
    description: "Paste the job description or role link. Sartho will break down the requirements, recruiter signals and your evidence-backed fit.",
  },
  {
    selector: '[data-tour="career-profile"]',
    title: "Next: confirm your Career Profile",
    description: "Approve the experience and achievements Sartho may use. This is what keeps matching and résumé tailoring honest.",
  },
  {
    selector: '[data-tour="applications"]',
    title: "Then: track the journey",
    description: "Keep recruiter messages, résumé versions, interviews and outcomes connected to the role that triggered them.",
  },
];

export function ProductTour() {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = stepIndex === null ? null : steps[stepIndex];

  const updateRect = useMemo(() => {
    return () => {
      if (!step) return;
      const target = document.querySelector(step.selector) as HTMLElement | null;
      if (!target) {
        setRect(null);
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => setRect(target.getBoundingClientRect()), 260);
    };
  }, [step]);

  useEffect(() => {
    const pending = window.localStorage.getItem("sartho-tour-pending");
    if (pending === "true") setStepIndex(0);
  }, []);

  useEffect(() => {
    if (stepIndex === null) return;
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [stepIndex, updateRect]);

  if (!step || stepIndex === null) return null;

  function close() {
    window.localStorage.removeItem("sartho-tour-pending");
    setStepIndex(null);
  }

  function next() {
    if (stepIndex === steps.length - 1) {
      close();
      return;
    }
    setRect(null);
    setStepIndex((current) => (current === null ? 0 : current + 1));
  }

  const cardStyle = rect
    ? {
        top: Math.min(window.innerHeight - 240, Math.max(24, rect.bottom + 18)),
        left: Math.min(window.innerWidth - 370, Math.max(24, rect.left)),
      }
    : undefined;

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Sartho guided tour">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      ) : null}
      <div className="tour-card glass-strong" style={cardStyle}>
        <div className="tour-step-label">Step {stepIndex + 1} of {steps.length}</div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
        <div className="tour-actions">
          <button type="button" className="ghost-button" onClick={close}>Skip</button>
          {stepIndex > 0 ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStepIndex((current) => (current === null ? 0 : current - 1))}
            >
              Back
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={next}>
            {stepIndex === steps.length - 1 ? "Finish" : "Next"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
