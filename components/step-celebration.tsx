"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { alreadyEarned, nextCelebration, type Celebration, type JourneyStepState } from "@/lib/journey/celebration";

/*
 * The moment a step lands.
 *
 * Uploading a résumé is the hardest thing Sartho asks of anybody: you hand over
 * your career and, at that instant, get nothing back. The product moved
 * silently past it — the menu quietly unlocked, and that was all.
 *
 * It appears once per step, ever, and it never blocks anything. A person who
 * has just finished a step is mid-flow, so this arrives beside the page rather
 * than over it: no backdrop, no modal, nothing to dismiss before continuing.
 * The celebration everyone remembers is the one that did not interrupt them.
 */

/** One key per browser profile. Small, and never worth a round trip. */
const SEEN_KEY = "sartho.celebrated.v1";

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    /* Private browsing refuses storage. A celebration is not worth an error. */
    return [];
  }
}

function writeSeen(ids: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* As above: losing this means one repeat card, which is survivable. */
  }
}

export function StepCelebration({ steps }: { steps: JourneyStepState[] | null }) {
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback((id: string) => {
    /* Marked seen on dismissal, not on display — a card closed by a stray
     * click during page load should still be shown properly next time. */
    setLeaving(true);
    window.setTimeout(() => {
      writeSeen([...readSeen(), id]);
      setCelebration(null);
      setLeaving(false);
    }, 320);
  }, []);

  useEffect(() => {
    if (!steps?.length || celebration) return;

    const seen = readSeen();

    /*
     * Nothing recorded yet means one of two people: somebody brand new, who
     * has completed nothing and will be celebrated as they go, or somebody who
     * has been using Sartho for months and would otherwise be congratulated on
     * work they finished in June. Their finished steps are marked as seen.
     */
    if (!seen.length) {
      const earned = alreadyEarned(steps);
      if (earned.length) {
        writeSeen(earned);
        return;
      }
    }

    const next = nextCelebration(steps, seen);
    /*
     * Cannot be derived during render: it reads localStorage, which does not
     * exist while the page renders on the server. Same reason the onboarding
     * carousel settles its own visibility in an effect.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next) setCelebration(next);
  }, [steps, celebration]);

  /*
   * Long enough to read twice, short enough not to linger. Cleared on unmount
   * so navigating away mid-celebration cannot fire a timer into a dead
   * component.
   */
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => dismiss(celebration.id), 14_000);
    return () => window.clearTimeout(timer);
  }, [celebration, dismiss]);

  useEffect(() => {
    if (!celebration) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(celebration.id); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [celebration, dismiss]);

  if (!celebration) return null;

  return (
    <aside
      className={`celebration${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      {/* Decorative only. Announced to nobody, and gone for anyone who has
          asked their system to reduce motion. */}
      <span className="celebration-glow" aria-hidden="true" />
      <span className="celebration-sparks" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => <i key={index} style={{ ["--i" as string]: index }} />)}
      </span>

      <div className="celebration-body">
        <span className="celebration-badge">
          <span className="celebration-tick" aria-hidden="true">✓</span>
          {celebration.badge}
        </span>
        <strong className="celebration-headline">{celebration.headline}</strong>
        <p className="celebration-detail">{celebration.detail}</p>
        <div className="celebration-actions">
          <Link href={celebration.ctaHref} className="primary-button" onClick={() => dismiss(celebration.id)}>
            {celebration.ctaLabel} <span aria-hidden="true">→</span>
          </Link>
          <button type="button" className="celebration-later" onClick={() => dismiss(celebration.id)}>
            Not now
          </button>
        </div>
      </div>

      <button
        type="button"
        className="celebration-close"
        onClick={() => dismiss(celebration.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </aside>
  );
}
