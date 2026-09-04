"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductJourneyStep } from "@/lib/journey/product-journey";

export function JourneyNudgeCard({ progress, isActivated, steps = [] }: { progress: number; isActivated: boolean; steps?: ProductJourneyStep[] }) {
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    // If they just hit 100%, show a celebration animation. Defer the state
    // update out of the synchronous effect body so it does not cascade renders.
    if (isActivated && !sessionStorage.getItem("sartho-celebrated")) {
      sessionStorage.setItem("sartho-celebrated", "true");
      const frame = requestAnimationFrame(() => setShowCelebration(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [isActivated]);

  if (isActivated) {
    if (!showCelebration) return null; // Only show once per session after completion

    return (
      <div style={{ background: "linear-gradient(135deg, #103d2e 0%, #174b3a 100%)", padding: "24px", borderRadius: "16px", marginBottom: "32px", border: "1px solid #6bcf93", position: "relative", overflow: "hidden", animation: "slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <div style={{ position: "absolute", top: -20, right: -20, fontSize: "120px", opacity: 0.1, pointerEvents: "none" }}>🎉</div>
        <h3 style={{ margin: "0 0 8px 0", color: "#fff", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#6bcf93" }}>✦</span> Profile 100% Complete!
        </h3>
        <p style={{ margin: "0 0 16px 0", color: "#b9d1c6", fontSize: "0.95rem", maxWidth: "600px", lineHeight: 1.5 }}>
          Congratulations! You&apos;ve successfully built your master career foundation. We have unlocked <strong>Job Analysis</strong>, <strong>Application Tracking</strong>, and the <strong>Résumé Studio</strong> in your sidebar. Sartho is now fully armed to act as your personal headhunter.
        </p>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link href="/applications#add-role" style={{ background: "#6bcf93", color: "#0d402b", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", textDecoration: "none", fontSize: "0.875rem" }}>
            Add your first role →
          </Link>
          <button type="button" onClick={() => setShowCelebration(false)} style={{ background: "transparent", color: "#b9d1c6", padding: "10px", border: "none", cursor: "pointer", fontSize: "0.875rem" }}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  const pendingSteps = steps.filter(s => !s.complete);

  // Nudge state for < 100% listing the specific pending items
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "24px", borderRadius: "16px", marginBottom: "32px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: "0 0 8px 0", color: "#fff", fontSize: "1.1rem" }}>Your workspace is {progress}% ready</h3>
          <p style={{ margin: 0, color: "#aaa", fontSize: "0.875rem", lineHeight: 1.5, maxWidth: "600px" }}>
            Complete the remaining {pendingSteps.length} action{pendingSteps.length === 1 ? "" : "s"} below to unlock AI Résumé Tailoring, Job Analysis, and automated interview prep.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
        {pendingSteps.map((step, idx) => (
          <div key={step.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: "bold" }}>
                {idx + 1}
              </div>
              <div>
                <strong style={{ color: "#fff", display: "block", fontSize: "0.95rem", marginBottom: "4px" }}>{step.label}</strong>
                <span style={{ color: "#888", fontSize: "0.85rem" }}>{step.detail}</span>
              </div>
            </div>
            <Link href={step.href} style={{ background: "#fff", color: "#07090d", padding: "8px 16px", borderRadius: "8px", fontWeight: 600, fontSize: "0.85rem", textDecoration: "none", whiteSpace: "nowrap" }}>
              Resume Task →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
