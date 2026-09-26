"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

/*
 * The first-run product tour.
 *
 * One dark-glass carousel of three slides, shown once after the first sign-in
 * (and replayable from the "Tour" link, which routes here via /?tour=1). It is a
 * focused overlay: it traps focus, closes on Escape, moves on the arrow keys,
 * and never blocks the user — closing is instant and persistence happens after.
 *
 * Slide changes carry a direction so the stage glides the way the user is going.
 */

type Slide = {
  eyebrow: string;
  title: string;
  description: string;
  outcome: string;
  route: string;
  visual: { kicker: string; title: string; detail: string; metric?: string }[];
};

const SESSION_DISMISS_KEY = "sartho-onboarding-dismissed-this-session";

const slides: Slide[] = [
  {
    eyebrow: "01 · Know yourself",
    title: "Your intelligent Career CoPilot.",
    description: "Know your strengths. Find the right opportunities. Move with confidence.",
    outcome: "Your career, understood.",
    route: "Career Intelligence",
    visual: [
      { kicker: "YOU", title: "Career intelligence", detail: "Built from your real experience", metric: "✓" },
      { kicker: "FIT", title: "Right opportunities", detail: "Focused on what deserves your time", metric: "→" },
      { kicker: "MOVE", title: "Ready for what’s next", detail: "Evidence behind every step", metric: "GO" },
    ],
  },
  {
    eyebrow: "02 · Find",
    title: "Opportunities worth your time.",
    description: "Search broadly. See what fits. Ignore the noise.",
    outcome: "Less searching. Better choices.",
    route: "Job Search",
    visual: [
      { kicker: "SEARCH", title: "Live opportunities", detail: "One focused shortlist" },
      { kicker: "FIT", title: "Evidence-led matching", detail: "Strengths and gaps made clear", metric: "82" },
      { kicker: "SOURCE", title: "Search provider", detail: "Clear source on every search", metric: "✓" },
    ],
  },
  {
    eyebrow: "03 · Prepare",
    title: "Walk in ready.",
    description: "Tailor your résumé and prepare for the role using only what you can defend.",
    outcome: "Truthful. Focused. Ready.",
    route: "Résumé & Interview",
    visual: [
      { kicker: "TAILOR", title: "Role-specific résumé", detail: "Built from approved evidence" },
      { kicker: "CHECK", title: "ATS ready", detail: "Readable and validated", metric: "✓" },
      { kicker: "PREPARE", title: "Interview confidence", detail: "Your evidence, ready to use", metric: "GO" },
    ],
  },
];

export function OnboardingCarousel({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const panelRef = useRef<HTMLDivElement>(null);

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [dismissed, setDismissed] = useState(true);
  const [saving, setSaving] = useState(false);

  const completed = user.user_metadata?.sartho_onboarding_complete === true;
  const [dontShowAgain, setDontShowAgain] = useState(completed);

  const replay = params.get("tour") === "1";

  useEffect(() => {
    queueMicrotask(() => setDismissed(window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "true"));
  }, [pathname]);

  const visible = pathname === "/" && (replay || (!completed && !dismissed));

  const finish = useCallback(async () => {
    if (saving) return;
    // Close immediately — persistence must never trap the user inside the tour.
    setDismissed(true);
    setSaving(true);
    try {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
    } catch {
      // Private browsing can refuse storage; the tour still closes for this view.
    }
    // Only touch the URL when replaying, to strip ?tour=1; otherwise leave the
    // command centre exactly as it is rather than forcing a navigation.
    if (replay) router.replace("/", { scroll: false });
    try {
      if (completed !== dontShowAgain) {
        const supabase = createClient();
        await supabase.auth.updateUser({ data: { sartho_onboarding_complete: dontShowAgain } });
      }
    } catch {
      // The choice is a convenience; failing to persist it must not surface here.
    } finally {
      setSaving(false);
    }
  }, [completed, dontShowAgain, replay, router, saving]);

  useEffect(() => {
    if (!visible) return;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),[href],[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    requestAnimationFrame(() => focusable()[0]?.focus());

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void finish();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setDir(1);
        setIndex((i) => Math.min(slides.length - 1, i + 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDir(-1);
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [finish, visible]);

  if (!visible) return null;

  const slide = slides[index];
  const last = index === slides.length - 1;
  const step = (target: number) => {
    setDir(target >= index ? 1 : -1);
    setIndex(Math.max(0, Math.min(slides.length - 1, target)));
  };

  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-cinema" ref={panelRef}>
        <div className="tour-topline">
          <span className="tour-count">{index + 1} of {slides.length}</span>
          <button type="button" className="tour-close" onClick={() => void finish()} aria-label="Close product tour">
            ×
          </button>
        </div>

        <button
          type="button"
          className="tour-arrow tour-arrow-left"
          onClick={() => step(index - 1)}
          disabled={index === 0}
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          type="button"
          className="tour-arrow tour-arrow-right"
          onClick={() => step(index + 1)}
          disabled={last}
          aria-label="Next"
        >
          ›
        </button>

        <div
          className="tour-stage"
          key={index}
          style={{ "--enter-x": dir >= 0 ? "26px" : "-26px" } as React.CSSProperties}
        >
          <section className="tour-copy">
            <span className="tour-eyebrow">{slide.eyebrow}</span>
            <h1 id="tour-title">{slide.title}</h1>
            <p>{slide.description}</p>
            <strong className="tour-outcome">{slide.outcome}</strong>
            <span className="tour-route">{slide.route}</span>
          </section>

          <section className="tour-visual" aria-label={slide.route}>
            {slide.visual.map((item, i) => (
              <article key={item.title} className={"tour-hero-card card-" + i}>
                <small>{item.kicker}</small>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                {item.metric ? <b>{item.metric}</b> : <span>→</span>}
              </article>
            ))}
          </section>
        </div>

        <footer className="tour-footer">
          <div className="tour-progress" aria-label={"Step " + (index + 1) + " of " + slides.length}>
            {slides.map((s, i) => (
              <button
                type="button"
                key={s.eyebrow}
                className={i === index ? "is-active" : ""}
                onClick={() => step(i)}
                aria-label={"Go to step " + (i + 1)}
                aria-current={i === index}
              />
            ))}
          </div>

          <label className="tour-dismiss">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} />
            Don’t show this again
          </label>

          <div className="tour-actions">
            <button type="button" className="tour-skip" onClick={() => void finish()}>
              Skip
            </button>
            {index > 0 ? (
              <button type="button" className="tour-secondary" onClick={() => step(index - 1)}>
                Back
              </button>
            ) : null}
            <button type="button" className="tour-primary" onClick={() => (last ? void finish() : step(index + 1))}>
              {last ? "Enter Sartho" : "Continue"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
