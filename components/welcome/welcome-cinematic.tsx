"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * The welcome, played once on the way in.
 *
 * It runs after a successful sign-in and nowhere else. That placement is the
 * whole point: a person who has just handed over an account is the one person
 * who has decided to care, and the one moment where four screens explaining
 * the product is a welcome rather than an obstacle. The same four screens in
 * front of the sign-in button were an obstacle, which is what they were until
 * now.
 *
 * Cinematic, and on a budget of one viewing. It advances itself, it can be
 * left at any point, and it never comes back — the marker that triggered it is
 * stripped from the address before the last panel finishes, so a reload lands
 * on the dashboard rather than replaying the introduction.
 */

type Scene = {
  id: string;
  kicker: string;
  line: string;
  body: string;
  visual: React.ReactNode;
};

const SCENES: Scene[] = [
  {
    id: "evidence",
    kicker: "First",
    line: "Your career becomes evidence.",
    body: "Sartho reads your résumé once and turns it into claims you confirm, one by one. Nothing it writes later can go beyond what you approved here.",
    visual: (
      <div className="wc-visual wc-visual--evidence">
        {[
          { claim: "Led ServiceNow delivery across 14 enterprise clients", state: "approved" },
          { claim: "Rebuilt the ITSM operating model for a regional bank", state: "approved" },
          { claim: "Owned a commercial P&L", state: "review" },
        ].map((item) => (
          <div className="wc-claim" data-state={item.state} key={item.claim}>
            <span className="wc-claim__mark" aria-hidden="true" />
            <span>{item.claim}</span>
            <em>{item.state === "approved" ? "Approved" : "Needs your call"}</em>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "roles",
    kicker: "Then",
    line: "Roles are scored on what you can prove.",
    body: "Google for Jobs, LinkedIn, Seek and employers' own careers pages — read in full, then measured against your evidence rather than against keywords.",
    visual: (
      <div className="wc-visual wc-visual--roles">
        <div className="wc-role">
          <span className="wc-role__top">Northgate Advisory · Singapore</span>
          <strong>Engagement Manager, Insurance &amp; Asset Management</strong>
          <span className="wc-role__score"><b>80%</b> match · 12 of 13 capability areas evidenced</span>
          <div className="wc-role__bar" aria-hidden="true"><span style={{ width: "80%" }} /></div>
        </div>
      </div>
    ),
  },
  {
    id: "analysis",
    kicker: "Every time",
    line: "A gap is reported as a gap.",
    body: "Each requirement in the advert is answered against your evidence. Where you cannot support one, Sartho says so rather than filling it in for you.",
    visual: (
      <div className="wc-visual wc-visual--analysis">
        {[
          { text: "10+ years leading enterprise delivery", state: "met", label: "Evidenced" },
          { text: "ServiceNow platform strategy", state: "met", label: "Evidenced" },
          { text: "Commercial ownership of a P&L", state: "partial", label: "Partial" },
          { text: "Financial services domain", state: "gap", label: "Gap" },
        ].map((item) => (
          <div className="wc-requirement" data-state={item.state} key={item.text}>
            <span className="wc-requirement__dot" aria-hidden="true" />
            <span>{item.text}</span>
            <em>{item.label}</em>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "resume",
    kicker: "And then",
    line: "A résumé that cites its sources.",
    body: "Write the master once. Every tailored version starts from it, keeps its own history, and shows which approved evidence each line came from.",
    visual: (
      <div className="wc-visual wc-visual--resume">
        <p className="wc-line">
          Led ServiceNow delivery for 14 enterprise clients across APAC.
          <span>cites 2 approved items</span>
        </p>
        <p className="wc-line">
          Rebuilt the ITSM operating model, cutting incident backlog by a third.
          <span>cites 1 approved item</span>
        </p>
        <p className="wc-line wc-line--muted">
          Pre-sales moved lower — this advert never asks about it.
          <span>tailoring decision</span>
        </p>
      </div>
    ),
  },
];

const SCENE_MS = 5200;

export function WelcomeCinematic() {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [still, setStill] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  /*
   * Cleared from the address as soon as it is playing, not when it ends.
   * Somebody who reloads halfway through has seen it, and a welcome that
   * restarts on every refresh is not a welcome.
   */
  useEffect(() => {
    router.replace("/", { scroll: false });
  }, [router]);

  useEffect(() => {
    /*
     * Read from the browser, so it cannot be known during render. Somebody who
     * has asked their system not to animate things gets the panels and the
     * buttons and no timer moving them on.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    frame.current?.focus();
  }, []);

  const finish = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    /* Long enough for the fade, short enough that nobody waits on it. */
    window.setTimeout(() => setLeaving(false), 620);
  }, [leaving]);

  useEffect(() => {
    if (still || leaving) return;
    const timer = window.setTimeout(() => {
      if (active >= SCENES.length - 1) finish();
      else setActive((current) => current + 1);
    }, SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [active, still, leaving, finish]);

  /* Dismissed once it has played, so the dashboard is not left behind a veil. */
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setGone(true), 600);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (gone) return null;

  const scene = SCENES[active];
  const last = active === SCENES.length - 1;

  return (
    <div
      className={`wc${leaving ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Sartho"
      ref={frame}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") finish();
        if (event.key === "ArrowRight" && !last) setActive(active + 1);
        if (event.key === "ArrowLeft" && active > 0) setActive(active - 1);
      }}
    >
      <div className="wc-progress" aria-hidden="true">
        {SCENES.map((item, index) => (
          <span className="wc-progress__step" key={item.id} data-state={index < active ? "done" : index === active ? "live" : "todo"}>
            <i style={still ? undefined : { animationDuration: `${SCENE_MS}ms` }} />
          </span>
        ))}
      </div>

      <button type="button" className="wc-skip" onClick={finish}>
        {last ? "Get started" : "Skip"}
      </button>

      <div className="wc-stage">
        {/* Keyed, so React replaces the node and the entrance runs each time. */}
        <div className="wc-scene" key={scene.id}>
          <p className="wc-kicker">{scene.kicker}</p>
          <h2 className="wc-line-title">{scene.line}</h2>
          <p className="wc-body">{scene.body}</p>
          {scene.visual}
        </div>
      </div>

      <div className="wc-foot">
        {last ? (
          <button type="button" className="wc-enter" onClick={finish}>
            Open Sartho <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button type="button" className="wc-next" onClick={() => setActive(active + 1)}>
            Next <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  );
}
