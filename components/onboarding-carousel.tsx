"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type PreviewKind = "discover" | "align" | "resume" | "prepare" | "land";

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
    stage: "Discover",
    title: "Find opportunities worthy of your experience.",
    description: "Move beyond vacancy lists. Focus on roles that match your leadership, transformation experience and career direction.",
    outcome: "The right opportunities, not more noise.",
    preview: "discover",
  },
  {
    stage: "Align",
    title: "See what the role is really asking for.",
    description: "Understand mandatory requirements, recruiter priorities, your strongest alignment and the gaps that need an honest decision.",
    outcome: "A clear, evidence-backed fit decision.",
    preview: "align",
  },
  {
    stage: "Stand out",
    title: "Tell the career story the role deserves.",
    description: "Shape a focused résumé that brings forward the most relevant achievements without inventing skills, metrics or responsibilities.",
    outcome: "A stronger résumé that remains completely true.",
    preview: "resume",
  },
  {
    stage: "Prepare",
    title: "Walk into the conversation ready.",
    description: "Turn the role and your real experience into likely questions, stronger answers and the stories worth carrying into the interview.",
    outcome: "Confidence built from your own evidence.",
    preview: "prepare",
  },
  {
    stage: "Land",
    title: "Keep every opportunity moving.",
    description: "Connect recruiter conversations, résumé versions, interviews, follow-ups and outcomes in one purposeful journey.",
    outcome: "Nothing falls through the cracks.",
    preview: "land",
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

  if (kind === "resume") {
    return (
      <div className="onboarding-product-preview" aria-hidden="true">
        <div className="preview-window-bar"><i /><i /><i /></div>
        <div className="preview-resume-card">
          <strong>Résumé Delta</strong>
          <small>Every change linked to approved evidence</small>
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

  if (kind === "prepare") {
    return (
      <div className="onboarding-product-preview" aria-hidden="true">
        <div className="preview-window-bar"><i /><i /><i /></div>
        <div className="preview-question-card">
          <strong>Likely leadership question</strong>
          <p>Tell us how you brought a complex service transition into stable operations.</p>
          <div className="preview-evidence-chips">
            <span>Operational readiness</span>
            <span>RAID governance</span>
            <span>BAU handover</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-product-preview" aria-hidden="true">
      <div className="preview-window-bar"><i /><i /><i /></div>
      <div className="preview-pipeline">
        <div className="is-active"><strong>Saved</strong><small>3 roles</small></div>
        <div className="is-active"><strong>Analysed</strong><small>2 roles</small></div>
        <div className="is-active"><strong>Prepared</strong><small>1 role</small></div>
        <div><strong>Interview</strong><small>Next</small></div>
        <div><strong>Offer</strong><small>Goal</small></div>
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
