"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EvidenceRecord, CareerRoleRecord, ProfileRecord } from "@/lib/types";

export function CareerProfileReview({ initialItems, roles, profile }: { initialItems: EvidenceRecord[]; roles: CareerRoleRecord[]; profile: ProfileRecord | null }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnhanced, setIsEnhanced] = useState(false);

  const pending = items.filter((item) => item.approval_status === "pending");
  const confirmed = pending.length === 0;

  async function confirmProfile() {
    if (busy || !pending.length) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/evidence/confirm-profile", { method: "PUT" });
      const result = await response.json() as { confirmed?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not confirm your profile.");
      setItems((current) => current.map((item) => item.approval_status === "pending"
        ? { ...item, approval_status: "approved", safe_for_resume: true }
        : item));
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.push("/career-direction");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not confirm your profile.");
    } finally {
      setBusy(false);
    }
  }

  function simulateEnhancement() {
    if (busy) return;
    setBusy(true);
    // Simulate AI loading
    setTimeout(() => {
      setIsEnhanced(true);
      setBusy(false);
    }, 1500);
  }

  if (confirmed) {
    return (
      <section className="glass-card profile-review" style={{ background: "rgba(13, 64, 43, 0.05)", border: "1px solid rgba(13, 64, 43, 0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", color: "#0d402b", margin: "0 0 0.25rem" }}>Profile Confirmed</h2>
            <p style={{ color: "#555", fontSize: "0.875rem", margin: 0 }}>Your master resume has been securely stored and parsed.</p>
          </div>
          <Link href="/career-direction" className="primary-button" style={{ background: "#0d402b", color: "white", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold" }}>
            Continue to Career Direction <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-card content-card profile-review" id="profile-review" style={{ background: "rgba(255,255,255,0.03)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", padding: 0, overflow: "hidden" }}>
      
      {/* Header */}
      <div style={{ padding: "2rem", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ maxWidth: "600px" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: "0.5rem" }}>Review parsing results</div>
          <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Check how Sartho read your resume</h2>
          <p style={{ color: "#aaa", fontSize: "0.875rem", lineHeight: 1.5 }}>
            Instead of making you verify every single bullet point, we just want to make sure the overall formatting and data was extracted cleanly. If this preview looks accurate, you can enhance it with AI or just confirm it as-is.
          </p>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button 
            type="button" 
            onClick={simulateEnhancement} 
            disabled={busy || isEnhanced}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: isEnhanced ? "rgba(107, 207, 147, 0.2)" : "transparent", color: isEnhanced ? "#6bcf93" : "#aaa", border: "1px solid", borderColor: isEnhanced ? "#6bcf93" : "rgba(255,255,255,0.1)", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: (busy || isEnhanced) ? "default" : "pointer", transition: "0.2s" }}
          >
            {busy ? (
              <span style={{ animation: "pulse 1.5s infinite" }}>Enhancing...</span>
            ) : isEnhanced ? (
              <>✨ AI Enhanced</>
            ) : (
              <>✨ Enhance with AI</>
            )}
          </button>
        </div>
      </div>

      {/* Document Preview Layout */}
      <div style={{ padding: "2rem", background: "rgba(0,0,0,0.2)" }}>
        <div style={{ background: "white", color: "#333", padding: "3rem", borderRadius: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxWidth: "800px", margin: "0 auto", minHeight: "600px" }}>
          
          {/* Resume Header */}
          <header style={{ borderBottom: "2px solid #eee", paddingBottom: "1.5rem", marginBottom: "2rem" }}>
            <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem", color: "#111" }}>{profile?.full_name || "Your Name"}</h1>
            <div style={{ display: "flex", gap: "1rem", color: "#666", fontSize: "0.875rem" }}>
              <span>{profile?.location || "Location not found"}</span>
              <span>•</span>
              <span>{profile?.work_authorisation || "Work rights not found"}</span>
            </div>
            {profile?.headline && <p style={{ fontSize: "1.1rem", color: "#444", marginTop: "1rem", fontWeight: 500 }}>{profile.headline}</p>}
            {profile?.summary && <p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.5rem", lineHeight: 1.6 }}>{profile.summary}</p>}
          </header>

          {/* Professional Experience */}
          <div>
            <h3 style={{ fontSize: "1.1rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#222", borderBottom: "1px solid #eee", paddingBottom: "0.5rem", marginBottom: "1.5rem" }}>Professional Experience</h3>
            
            {roles && roles.length > 0 ? roles.map((role) => {
              const roleEvidence = items.filter(e => e.career_role_id === role.id);
              return (
                <div key={role.id} style={{ marginBottom: "2rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
                    <strong style={{ fontSize: "1.1rem", color: "#111" }}>{role.title}</strong>
                    <span style={{ fontSize: "0.875rem", color: "#666" }}>{role.start_date ? new Date(role.start_date).getFullYear() : ""} - {role.is_current ? "Present" : (role.end_date ? new Date(role.end_date).getFullYear() : "")}</span>
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#555", marginBottom: "0.75rem", fontWeight: 500 }}>{role.employer} {role.location ? `· ${role.location}` : ""}</div>
                  
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#444", fontSize: "0.875rem", lineHeight: 1.6 }}>
                    {roleEvidence.map(evidence => (
                      <li key={evidence.id} style={{ marginBottom: "0.5rem" }}>
                        {isEnhanced ? (
                          <span style={{ background: "rgba(107, 207, 147, 0.15)", padding: "2px 0" }}>{evidence.claim}</span>
                        ) : evidence.claim}
                        {evidence.metrics.length > 0 && (
                          <strong style={{ color: "#0d402b", marginLeft: "6px" }}>[{evidence.metrics.join(", ")}]</strong>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }) : (
              <p style={{ color: "#888", fontStyle: "italic" }}>No roles extracted.</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ padding: "1.5rem 2rem", background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          {error ? <span style={{ color: "#ff6b6b" }}>{error}</span> : <span style={{ color: "#888" }}>The AI cleanly parsed {roles?.length || 0} roles and {items.length} bullet points.</span>}
        </div>
        <button 
          type="button" 
          onClick={() => void confirmProfile()} 
          disabled={busy || !pending.length}
          style={{ background: "#0d402b", color: "white", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1, transition: "0.2s" }}
        >
          {busy && !isEnhanced ? "Confirming…" : "Everything looks right — continue"}
        </button>
      </div>
    </section>
  );
}
