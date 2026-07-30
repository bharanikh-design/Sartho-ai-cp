"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Slide = {
  stage: string;
  title: string;
  description: string;
  outcome: string;
  symbol: string;
};

const slides: Slide[] = [
  {
    stage: "Discover",
    title: "Find opportunities worthy of your experience.",
    description: "Move beyond vacancy lists. Focus on roles that match your leadership, transformation experience and career direction.",
    outcome: "The right opportunities, not more noise.",
    symbol: "✦",
  },
  {
    stage: "Align",
    title: "See what the role is really asking for.",
    description: "Understand mandatory requirements, recruiter priorities, your strongest alignment and the gaps that need an honest decision.",
    outcome: "A clear, evidence-backed fit decision.",
    symbol: "◎",
  },
  {
    stage: "Stand out",
    title: "Tell the career story the role deserves.",
    description: "Shape a focused résumé that brings forward the most relevant achievements without inventing skills, metrics or responsibilities.",
    outcome: "A stronger résumé that remains completely true.",
    symbol: "R",
  },
  {
    stage: "Prepare",
    title: "Walk into the conversation ready.",
    description: "Turn the role and your real experience into likely questions, stronger answers and the stories worth carrying into the interview.",
    outcome: "Confidence built from your own evidence.",
    symbol: "Q",
  },
  {
    stage: "Land",
    title: "Keep every opportunity moving.",
    description: "Connect recruiter conversations, résumé versions, interviews, follow-ups and outcomes in one purposeful journey.",
    outcome: "Nothing falls through the cracks.",
    symbol: "↗",
  },
];

export function OnboardingCarousel({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [replay, setReplay] = useState(false);
  const [saving, setSaving] = useState(false);

  const completed = user.user_metadata?.sartho_onboarding_complete === true;
  const fullName = (user.user_metadata?.full_name as string | undefined) || user.email?.split("@")[0] || "there";
  const firstName = fullName.split(" ")[0];

  useEffect(() => {
    const shouldReplay = new URLSearchParams(window.location.search).get("tour") === "1";
    setReplay(shouldReplay);
    setVisible(pathname === "/" && (shouldReplay || !completed));
  }, [completed, pathname]);

  const finish = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    if (!completed) {
      await supabase.auth.updateUser({
        data: { sartho_onboarding_complete: true },
      });
    }

    setVisible(false);
    setSaving(false);
    if (replay) router.replace("/");
    router.refresh();
  }, [completed, replay, router, saving, supabase]);

  useEffect(() => {
    if (!visible) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void finish();
      if (event.key === "ArrowRight") setIndex((current) => Math.min(slides.length - 1, current + 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish, visible]);

  if (!visible) return null;

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Sartho">
      <button className="onboarding-backdrop" type="button" onClick={() => void finish()} aria-label="Close welcome guide" />

      <section className="onboarding-phone" aria-live="polite">
        <div className="onboarding-phone-handle" aria-hidden="true" />

        <header className="onboarding-header">
          <div className="onboarding-brand">
            <span className="brand-mark brand-mark-small" aria-hidden="true"><span>S</span></span>
            <div><strong>Sartho AI</strong><small>Your career, intelligently guided.</small></div>
          </div>
          <button className="onboarding-close" type="button" onClick={() => void finish()} aria-label="Skip introduction">×</button>
        </header>

        <div className="onboarding-progress-label">
          <span>Welcome, {firstName}</span>
          <strong>{index + 1} of {slides.length}</strong>
        </div>

        <div className="onboarding-visual" key={`visual-${index}`}>
          <span className="onboarding-symbol" aria-hidden="true">{slide.symbol}</span>
          <div className="onboarding-mini-path" aria-hidden="true">
            {slides.map((item, itemIndex) => (
              <i key={item.stage} className={itemIndex <= index ? "is-active" : ""} />
            ))}
          </div>
        </div>

        <div className="onboarding-copy" key={`copy-${index}`}>
          <span className="onboarding-stage">{slide.stage}</span>
          <h2>{slide.title}</h2>
          <p>{slide.description}</p>
          <div className="onboarding-outcome"><span aria-hidden="true">✓</span>{slide.outcome}</div>
        </div>

        <footer className="onboarding-footer">
          <div className="onboarding-dots" aria-label={`Slide ${index + 1} of ${slides.length}`}>
            {slides.map((item, itemIndex) => (
              <button
                key={item.stage}
                type="button"
                className={itemIndex === index ? "is-active" : ""}
                onClick={() => setIndex(itemIndex)}
                aria-label={`Show ${item.stage}`}
              />
            ))}
          </div>

          <div className="onboarding-actions">
            <button type="button" className="onboarding-skip" onClick={() => void finish()} disabled={saving}>Skip</button>
            {index > 0 ? (
              <button type="button" className="onboarding-back" onClick={() => setIndex((current) => current - 1)} disabled={saving}>Back</button>
            ) : null}
            <button
              type="button"
              className="onboarding-next"
              onClick={() => isLast ? void finish() : setIndex((current) => current + 1)}
              disabled={saving}
            >
              {saving ? "Opening…" : isLast ? "Enter Sartho" : "Next"}<span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
