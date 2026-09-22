"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Slide = { eyebrow: string; title: string; description: string; outcome: string; route: string; visual: string[] };

const SESSION_DISMISS_KEY = "sartho-onboarding-dismissed-this-session";
const slides: Slide[] = [
  { eyebrow:"01 · Build your career truth", title:"Start with one Master Résumé.", description:"Upload your strongest résumé once. Sartho turns it into career evidence you control, keeps one Master, and uses that truth everywhere else.", outcome:"One career source of truth. No invented claims.", route:"Résumé Studio", visual:["Upload résumé","Approve evidence","Master résumé"] },
  { eyebrow:"02 · Discover the right work", title:"Search for fit, not noise.", description:"Sartho compares opportunities with your evidence, seniority and target markets so you can focus on roles worth your time.", outcome:"Résumé Quality and Job Match explain why a role fits.", route:"Job Search", visual:["Career evidence","Role requirements","Job Match"] },
  { eyebrow:"03 · Save jobs from anywhere", title:"The browser extension brings the web into Sartho.", description:"On LinkedIn, SEEK or an employer careers page, save the role with the Sartho extension. The full advert comes back to your workspace for analysis.", outcome:"Browse → Save with Sartho → Analyse. No copy-and-paste workflow.", route:"Browser Extension", visual:["Open job advert","Save with Sartho","Role appears in Sartho"] },
  { eyebrow:"04 · Tailor with evidence", title:"One role. One purposeful résumé.", description:"Sartho starts from your Master, surfaces evidence the role needs, exposes unsupported gaps, and creates a role-specific version without keyword stuffing.", outcome:"Supported but missing → surface it. Unsupported → never invent it.", route:"Résumé Studio", visual:["Master","Career evidence","Tailored résumé"] },
  { eyebrow:"05 · Match the market", title:"Country and profession shape the document.", description:"Australia, USA, UK, Singapore, UAE/GCC and India have different expectations. Sartho combines market, profession and seniority to recommend the right ATS-safe presentation.", outcome:"Mechanical Engineer in the UK? Engineering can be recommended automatically.", route:"Market Fit", visual:["Country","Profession","Recommended template"] },
  { eyebrow:"06 · Validate before you send", title:"Know what the ATS will actually read.", description:"Before export, Sartho checks structure and reads the generated Word/PDF back through its parser so lost facts and formatting problems are visible before an employer sees them.", outcome:"Quality → Job Match → Parse check → Export.", route:"Ready to apply", visual:["Résumé Quality","Parse fidelity","Export"] },
];

export function OnboardingCarousel({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
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
    if (completed !== dontShowAgain) await supabase.auth.updateUser({ data: { sartho_onboarding_complete: dontShowAgain } });
    if (dontShowAgain) window.sessionStorage.removeItem(SESSION_DISMISS_KEY);
    else window.sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
    setDismissedThisSession(true);
    setSaving(false);
    router.refresh();
  }, [completed, dontShowAgain, router, saving]);

  useEffect(() => {
    if (!visible) return;
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? []);
    requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); void finish(); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); setIndex((i) => Math.min(slides.length - 1, i + 1)); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((i) => Math.max(0, i - 1)); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [finish, visible]);

  if (!visible) return null;
  const slide = slides[index], isLast = index === slides.length - 1;

  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-cinema" ref={panelRef}>
        <div className="tour-topline"><span className="tour-brand">SARTHO · PRODUCT TOUR</span><button className="tour-close" onClick={() => void finish()} aria-label="Close product tour">×</button></div>
        <div className="tour-stage">
          <section className="tour-copy">
            <span className="tour-eyebrow">{slide.eyebrow}</span>
            <h1 id="tour-title">{slide.title}</h1>
            <p>{slide.description}</p>
            <strong className="tour-outcome">{slide.outcome}</strong>
            <span className="tour-route">{slide.route}</span>
          </section>
          <section className="tour-visual" aria-label={slide.route}>
            <span className="tour-orbit" aria-hidden="true" />
            {slide.visual.map((item, i) => <div key={item} className={"tour-hero-card card-" + i}><small>0{i + 1}</small><strong>{item}</strong>{i < slide.visual.length - 1 ? <span>→</span> : null}</div>)}
          </section>
        </div>
        <footer className="tour-footer">
          <div className="tour-progress" aria-label={"Step " + (index + 1) + " of " + slides.length}>
            {slides.map((item, i) => <button key={item.eyebrow} className={i === index ? "is-active" : ""} onClick={() => setIndex(i)} aria-label={"Go to step " + (i + 1)} />)}
          </div>
          <label className="tour-dismiss"><input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} /> Do not show this next time</label>
          <div className="tour-actions">
            <button className="tour-skip" onClick={() => void finish()}>Skip</button>
            {index > 0 ? <button className="tour-secondary" onClick={() => setIndex(index - 1)}>Back</button> : null}
            <button className="tour-primary" onClick={() => isLast ? void finish() : setIndex(index + 1)}>{isLast ? "Enter Sartho" : "Continue"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
