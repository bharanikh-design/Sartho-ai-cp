"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/*
 * Written as what somebody gets, not as how it works.
 *
 * The first version of these four scenes said "your career becomes evidence",
 * "roles are scored against it", "a gap is reported as a gap" — all true, all
 * mechanism. That is the five-gigabyte-MP3-player way to describe a thing. The
 * line worth saying is the one about the person's afternoon: they stop keeping
 * twelve tabs open, and they stop guessing which roles are worth the evening.
 *
 * Search and the extension lead, because they are what changes the day. The
 * honest matching and the résumé follow, because they are what makes the first
 * two worth trusting.
 */
const SCENES: Scene[] = [
  {
    id: "search",
    kicker: "Find",
    line: "Every job board. One search.",
    body: "Sartho searches Google for Jobs, which carries LinkedIn, Indeed, Seek and employers\u2019 own careers pages — and reads each advert in full rather than the four-line summary an aggregator gives you.",
    visual: (
      <div className="wc-visual wc-visual--search">
        <div className="wc-sources">
          {["LinkedIn", "Indeed", "Seek", "Careers pages", "Google for Jobs"].map((source) => (
            <span className="wc-source" key={source}>{source}</span>
          ))}
        </div>
        <div className="wc-funnel" aria-hidden="true"><span /><span /><span /></div>
        <p className="wc-outcome">
          <strong>One list.</strong> Ranked by how much of each role you can evidence.
        </p>
      </div>
    ),
  },
  {
    id: "extension",
    kicker: "Or capture",
    line: "Found a role somewhere else? One click.",
    body: "The browser extension sends any posting you are looking at — anywhere on the web — straight into Sartho with the whole advert intact, and it comes back analysed before you have closed the tab.",
    visual: (
      <div className="wc-visual wc-visual--capture">
        <div className="wc-capture__row">
          <span className="wc-capture__from">Any job board</span>
          <span className="wc-capture__arrow" aria-hidden="true">→</span>
          <span className="wc-capture__to">Sartho</span>
        </div>
        <div className="wc-signal">
          <span className="wc-signal__label">Signal strength</span>
          <span className="wc-signal__bars" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          <strong>Strong — 12 of 13 requirements answerable</strong>
        </div>
        <p className="wc-outcome">Analysed on arrival. You never have to ask for it.</p>
      </div>
    ),
  },
  {
    id: "honest",
    kicker: "Then know",
    line: "Which ones are actually worth your evening.",
    body: "Every requirement in the advert, answered against evidence you approved. Where you cannot support one, Sartho says so — so you spend your time on the roles you can win and skip the ones you cannot.",
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
    kicker: "And walk in",
    line: "A résumé you can defend in the room.",
    body: "One per role, built in minutes from the master, with every line traceable to something you confirmed. Nothing on it is a sentence you will have to explain away at interview.",
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
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [still, setStill] = useState(false);\n  const [neverAgain, setNeverAgain] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  /*
   * Cleared from the address as soon as it is playing, not when it ends.
   * Somebody who reloads halfway through has seen it, and a welcome that
   * restarts on every refresh is not a welcome.
   *
   * Done through history rather than the router, which is the whole reason
   * this screen used to vanish a few seconds in. router.replace re-runs the
   * server component that decided to show this, and without the marker in the
   * address that component stops rendering it — so the welcome unmounted
   * itself while somebody was still reading the first scene. replaceState
   * changes the address and nothing else.
   */
  useEffect(() => {
    window.history.replaceState(window.history.state, "", "/");
  }, []);

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
  }, [leaving, neverAgain]);

  /*
   * The scenes advance themselves; the screen does not close itself.
   *
   * It used to call finish() after the last one, so a welcome nobody touched
   * disappeared on its own. Holding on the final scene means the only ways out
   * are Skip, Open Sartho and Escape — which is what a screen is, as opposed to
   * a transition somebody has to catch.
   */
  useEffect(() => {
    if (still || leaving) return;
    if (active >= SCENES.length - 1) return;
    const timer = window.setTimeout(() => setActive((current) => current + 1), SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [active, still, leaving]);

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
      {/*
        * The bar measures time until the next scene, and on the last one there
        * is none — it holds there until somebody leaves. Drawn full rather than
        * counting down to nothing, which would read as stuck.
        */}
      <div className="wc-progress" aria-hidden="true">
        {SCENES.map((item, index) => {
          const counting = index === active && !last && !still;
          return (
            <span
              className="wc-progress__step"
              key={item.id}
              data-state={index < active || (index === active && (last || still)) ? "done" : counting ? "live" : "todo"}
            >
              <i style={counting ? { animationDuration: `${SCENE_MS}ms` } : undefined} />
            </span>
          );
        })}
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

      <div className="wc-foot">\n        {last ? <label className="wc-never"><input type="checkbox" checked={neverAgain} onChange={(event) => setNeverAgain(event.target.checked)} /> <span>Don’t show this again</span></label> : null}
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
