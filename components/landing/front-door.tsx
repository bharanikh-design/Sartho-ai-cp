"use client";

import { useCallback, useRef } from "react";
import { Navbar } from "@/components/landing/navbar";
import { ParticleRibbon } from "@/components/landing/particle-ribbon";
import { AuthCard } from "@/components/auth/auth-card";
import { useOAuthSignIn } from "@/lib/auth/use-oauth-sign-in";
import { usePointerParallax } from "@/lib/landing/use-pointer-parallax";

/*
 * The front door.
 *
 * One screen carrying the whole first impression: the living ribbon behind it,
 * the brand and navigation across the top, the promise on the left and the way
 * in on the right. It is the same component the home page and /login both render,
 * so the entrance is identical wherever a visitor lands, and there is never a
 * screen standing between someone and the sign-in they came for.
 *
 * The stage owns the scene's motion. usePointerParallax writes the pointer onto
 * this element; the ribbon, the card and the copy all read it and drift together
 * as one body rather than as separate reactions to the same mouse.
 */

const FEATURES = [
  { title: "Role Matching", sub: "Find better opportunities", icon: SearchGlyph },
  { title: "Résumé Tailoring", sub: "Stand out with impact", icon: DocGlyph },
  { title: "Interview Preparation", sub: "Be ready, be confident", icon: ChartGlyph },
];

export function FrontDoor() {
  const { busy, error, signInWithProvider } = useOAuthSignIn();
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  usePointerParallax(stageRef);

  const scrollToCard = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    // Move focus to the first provider so a keyboard user lands on the action,
    // not just the scroll. Deferred a beat so the smooth scroll can begin first.
    window.setTimeout(() => {
      card.querySelector<HTMLButtonElement>(".fd-providers button")?.focus();
    }, 420);
  }, []);

  return (
    <div className="fd" ref={stageRef}>
      <ParticleRibbon />

      <div className="fd-shell">
        <Navbar onGetStarted={scrollToCard} />

        <div className="fd-stage">
          <section className="fd-pitch">
            <p className="fd-eyebrow">Career clarity · Real opportunities · A brighter you</p>
            <h1 className="fd-headline">
              Your own headhunter. <em>Finally.</em>
            </h1>
            <p className="fd-lead">
              An AI career copilot that understands your journey, uncovers what&rsquo;s next,
              and helps you get there with confidence.
            </p>

            <ul className="fd-features" id="what-it-does">
              {FEATURES.map(({ title, sub, icon: Icon }) => (
                <li className="fd-feature" key={title}>
                  <span className="fd-feature-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="fd-feature-text">
                    <strong>{title}</strong>
                    <small>{sub}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <AuthCard
            ref={cardRef}
            id="sign-in"
            busy={busy}
            error={error}
            onProvider={signInWithProvider}
          />
        </div>

        <div className="fd-baseline" aria-hidden="true">
          <span className="fd-baseline-brand">People · Possibilities · Progress</span>
          <span className="fd-baseline-note">A more fulfilling tomorrow</span>
        </div>
      </div>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function DocGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3.5h7L18.5 9v11.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 3.5V9h5.5M8.5 13h7M8.5 16.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 20h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="6" y="11" width="3.4" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14.6" y="7" width="3.4" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
