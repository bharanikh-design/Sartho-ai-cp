"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

/*
 * Three, matching the three steps somebody actually completes. The tour was
 * five — it also covered interview preparation and outcome tracking, which are
 * true but are things you meet weeks later, and a person who has uploaded
 * nothing yet is being sold a chapter they cannot open. A first run should
 * describe the first run.
 */
type PreviewKind = "resume" | "discover" | "align";

type Slide = {
  stage: string;
  title: string;
  description: string;
  outcome: string;
  preview: PreviewKind;
};

const SESSION_DISMISS_KEY = "sartho-onboarding-dismissed-this-session";

const slides: Slide[] = [
  {
    stage: "Your evidence",
    title: "It starts with what you have actually done.",
    description: "Upload your résumé once. Sartho reads it into approved career evidence — the roles you held, the work you did, the results you can stand behind.",
    outcome: "Nothing invented. Ever.",
    preview: "resume",
  },
  {
    stage: "The right roles",
    title: "See the roles that fit, not the whole job board.",
    description: "Sartho searches live listings in your markets and scores each one against your evidence — and leaves out the roles asking for years you do not yet have.",
    outcome: "A shortlist, not a feed.",
    preview: "discover",
  },
  {
    stage: "Apply with proof",
    title: "Walk in with the evidence behind you.",
    description: "See exactly which requirements your experience meets and which it does not, then tailor a résumé that stays completely true to your record.",
    outcome: "An honest case, made well.",
    preview: "align",
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
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const completed = user.user_metadata?.sartho_onboarding_complete === true;
  const fullName = (user.user_metadata?.full_name as string | undefined) || user.email?.split("@")[0] || "there";
  const firstName = fullName.split(" ")[0];

  useEffect(() => {
    const shouldReplay = new URLSearchParams(window.location.search).get("tour") === "1";
    const dismissedThisSession = window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "true";

    /*
     * Both reads are browser-only and unavailable while the page renders on the
     * server, so this state cannot be derived during render — it has to settle
     * once, in an effect, after hydration.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplay(shouldReplay);
    setDontShowAgain(completed);
    setVisible(pathname === "/" && (shouldReplay || (!completed && !dismissedThisSession)));
  }, [completed, pathname]);

  const finish = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    const preferenceChanged = completed !== dontShowAgain;
    if (preferenceChanged) {
      await supabase.auth.updateUser({
        data: { sartho_onboarding_complete: dontShowAgain },
      });
    }

    if (dontShowAgain) {
      window.sessionStorage.removeItem(SESSION_DISMISS_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
    }

    setVisible(false);
    setSaving(false);
    if (replay) router.replace("/");
    router.refresh();
  }, [completed, dontShowAgain, replay, router, saving, supabase]);

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
          <button className="onboarding-close" type="button" onClick={() => void finish()} aria-label="Close introduction">×</button>
        </header>

        <div className="onboarding-progress-label">
          <span>Welcome, {firstName}</span>
          <strong>{index + 1} of {slides.length}</strong>
        </div>

        <div className="onboarding-visual" key={`visual-${index}`}>
          <FeaturePreview kind={slide.preview} />
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
          <div>
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
            <label className="onboarding-preference">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(event) => setDontShowAgain(event.target.checked)}
              />
              <span>Do not show this next time</span>
            </label>
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

function FeaturePreview({ kind }: { kind: PreviewKind }) {
  if (kind === "discover") {
    return (
      <div className="onboarding-product-preview" aria-hidden="true">
        <div className="preview-window-bar"><i /><i /><i /></div>
        <div className="preview-role-list">
          <PreviewRole title="Transition & Transformation Manager" company="Recruiter referral" score="91%" />
          <PreviewRole title="EUC Transformation Lead" company="Strong leadership alignment" score="86%" />
          <PreviewRole title="Service Delivery Director" company="Worth reviewing" score="78%" />
        </div>
      </div>
    );
  }

  if (kind === "align") {
    return (
      <div className="onboarding-product-preview" aria-hidden="true">
        <div className="preview-window-bar"><i /><i /><i /></div>
        <div className="preview-fit-card">
          <div className="preview-score">88%</div>
          <div className="preview-bars">
            <label>Mandatory requirements<i><b style={{ width: "88%" }} /></i></label>
            <label>Leadership alignment<i><b style={{ width: "94%" }} /></i></label>
            <label>Evidence confidence<i><b style={{ width: "82%" }} /></i></label>
          </div>
        </div>
      </div>
    );
  }

  /*
   * The last of the three, so it needs no guard — TypeScript proves the union
   * is exhausted, which is the point of narrowing PreviewKind to what the tour
   * actually shows.
   */
  return (
    <div className="onboarding-product-preview" aria-hidden="true">
      <div className="preview-window-bar"><i /><i /><i /></div>
      <div className="preview-resume-card">
        <strong>Your approved evidence</strong>
        <small>Read straight from your résumé, nothing added</small>
        <div className="preview-change">
          <del>Managed transformation activities</del>
          <ins>Led a multi-tower transition and transformation programme through operational readiness and BAU handover.</ins>
        </div>
        <div className="preview-resume-line" />
        <div className="preview-resume-line medium" />
        <div className="preview-resume-line short" />
      </div>
    </div>
  );
}

function PreviewRole({ title, company, score }: { title: string; company: string; score: string }) {
  return (
    <div className="preview-role-row">
      <div><strong>{title}</strong><small>{company}</small></div>
      <span className="preview-match-badge">{score}</span>
    </div>
  );
}
