"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Slide = {
  stage: string;
  title: string;
  description: string;
  outcome: string;
};

const SESSION_DISMISS_KEY = "sartho-onboarding-dismissed-this-session";

const slides: Slide[] = [
  {
    stage: "Your evidence",
    title: "Career truth, not claims.",
    description: "Your résumé is read once into evidence you approve. Every line Sartho writes afterwards cites it, so nothing on your résumé is something you cannot back.",
    outcome: "Nothing invented. Ever.",
  },
  {
    stage: "The right roles",
    title: "Roles scored against your evidence.",
    description: "Sartho searches live listings in your markets and scores each one against your evidence — and leaves out the roles asking for years you do not yet have.",
    outcome: "A shortlist, not a feed.",
  },
  {
    stage: "Apply with proof",
    title: "A master résumé, and one per role.",
    description: "Write the master once. Every tailored version starts from it, keeps its own history, and says what tailoring was worth.",
    outcome: "An honest case, made well.",
  },
  {
    stage: "Anywhere you go",
    title: "Save a role from anywhere.",
    description: "The browser extension sends a posting from LinkedIn, Seek or an employer's own careers page straight into Sartho, with the full advert intact.",
    outcome: "Seamless integration.",
  }
];

export function OnboardingCarousel({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [dismissedThisSession, setDismissedThisSession] = useState(true);
  const [saving, setSaving] = useState(false);
  const completed = user.user_metadata?.sartho_onboarding_complete === true;
  const [dontShowAgain, setDontShowAgain] = useState(completed);

  useEffect(() => {
    const dismissed = window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "true";
    queueMicrotask(() => setDismissedThisSession(dismissed));
  }, [pathname]);

  const shouldReplay = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tour") === "1";
  const visible = pathname === "/" && (shouldReplay || (!completed && !dismissedThisSession));

  const finish = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const supabase = createClient();
    
    if (completed !== dontShowAgain) {
      await supabase.auth.updateUser({
        data: { sartho_onboarding_complete: dontShowAgain },
      });
    }

    if (dontShowAgain) {
      window.sessionStorage.removeItem(SESSION_DISMISS_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
    }

    setDismissedThisSession(true);
    setSaving(false);
    router.refresh();
  }, [completed, dontShowAgain, router, saving]);

  if (!visible) return null;

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(12px)" }} role="dialog" aria-modal="true" aria-label="Welcome to Sartho">
      <div style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "24px", padding: "48px", maxWidth: "800px", width: "90%", boxShadow: "0 24px 48px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: "32px", position: "relative", animation: "slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}>
        
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
           <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
             <span style={{ fontSize: "24px" }}>✦</span>
             <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#fff" }}>What Sartho Does</h1>
           </div>
           <button onClick={finish} style={{ background: "none", border: "none", color: "#888", fontSize: "24px", cursor: "pointer" }}>×</button>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minHeight: "180px" }}>
          <span style={{ color: "#6bcf93", fontSize: "0.9rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>{slide.stage}</span>
          <h2 style={{ margin: 0, fontSize: "2.5rem", color: "#fff", lineHeight: 1.2 }}>{slide.title}</h2>
          <p style={{ margin: 0, fontSize: "1.1rem", color: "#b9d1c6", lineHeight: 1.6, maxWidth: "600px" }}>{slide.description}</p>
        </div>

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "32px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              {slides.map((_, i) => (
                <button key={i} onClick={() => setIndex(i)} style={{ width: "40px", height: "4px", borderRadius: "2px", background: i === index ? "#6bcf93" : "rgba(255,255,255,0.2)", border: "none", cursor: "pointer", padding: 0 }} aria-label={`Go to slide ${i + 1}`} />
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#888", fontSize: "0.85rem", cursor: "pointer" }}>
              <input type="checkbox" checked={dontShowAgain} onChange={e => setDontShowAgain(e.target.checked)} />
              Do not show this next time
            </label>
          </div>

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <button onClick={finish} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontWeight: "bold" }}>Skip</button>
            <button onClick={() => isLast ? finish() : setIndex(i => i + 1)} style={{ background: "#fff", color: "#000", padding: "12px 24px", borderRadius: "12px", border: "none", fontWeight: "bold", cursor: "pointer" }}>
              {isLast ? "Get Started" : "Next →"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
