"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function JourneyNudgeCard({ progress, isActivated }: { progress: number; isActivated: boolean }) {
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    // If they just hit 100%, show a celebration animation (e.g. if we set a sessionStorage flag)
    // For simplicity, we just use the raw boolean to show the 100% state
    if (isActivated && !sessionStorage.getItem("sartho-celebrated")) {
      setShowCelebration(true);
      sessionStorage.setItem("sartho-celebrated", "true");
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
          <Link href="/jobs" style={{ background: "#6bcf93", color: "#0d402b", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", textDecoration: "none", fontSize: "0.875rem" }}>
            Explore Opportunities →
          </Link>
          <button type="button" onClick={() => setShowCelebration(false)} style={{ background: "transparent", color: "#b9d1c6", padding: "10px", border: "none", cursor: "pointer", fontSize: "0.875rem" }}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Nudge state for < 100%
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "20px 24px", borderRadius: "16px", marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "24px" }}>
      <div>
        <h3 style={{ margin: "0 0 4px 0", color: "#fff", fontSize: "1rem" }}>Your workspace is {progress}% ready</h3>
        <p style={{ margin: 0, color: "#aaa", fontSize: "0.85rem", lineHeight: 1.4 }}>
          Finish your Career Profile to unlock AI Résumé Tailoring, Job Analysis, and automated interview prep.
        </p>
      </div>
      <Link href="/journey" style={{ background: "#fff", color: "#07090d", padding: "10px 20px", borderRadius: "8px", fontWeight: 600, fontSize: "0.875rem", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
        Complete Profile →
      </Link>
    </div>
  );
}
