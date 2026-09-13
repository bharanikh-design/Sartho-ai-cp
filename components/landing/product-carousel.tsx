"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * The product, shown rather than described.
 *
 * A carousel is usually the wrong answer — a rotating tray of marketing claims
 * is something people learn to scroll past. This one earns its place by
 * carrying no claims at all: each panel is a rendering of a surface Sartho
 * actually produces, in the product's own type and colour. Somebody deciding
 * whether to sign up wants to know what they get, and the shortest honest
 * answer is to show them.
 *
 * Built as markup rather than screenshots on purpose. A screenshot goes stale
 * the first time the product changes, is a blurred mess on a retina display
 * unless it is shipped at 3x, and cannot follow the viewer's colour scheme.
 * This follows the same tokens as the real thing, so it stays true by
 * construction and reads correctly in either theme.
 */

type Panel = {
  id: string;
  label: string;
  caption: string;
  body: React.ReactNode;
};

/*
 * Illustrative of the product's own output. The shape is exactly what Sartho
 * renders; the role and the employer are invented.
 *
 * Deliberately invented. An earlier draft put a real firm's name on a made-up
 * assessment, which is a small thing that is also the one thing this product
 * says it never does — and nobody should have to work out whether a card on a
 * marketing page is a real listing or a drawing of one.
 */
const PANELS: Panel[] = [
  {
    id: "match",
    label: "Find roles",
    caption: "Every advert read in full, then scored against evidence you approved.",
    body: (
      <div className="stage-card">
        <div className="stage-card__top">
          <span className="stage-card__employer">Northgate Advisory · Singapore</span>
          <span className="stage-chip stage-chip--apply">APPLY</span>
        </div>
        <h4 className="stage-card__title">Engagement Manager, Insurance &amp; Asset Management</h4>
        <p className="stage-card__meta">
          <strong>80% match</strong> · Google for Jobs · evidences 12 of 13 capability areas
        </p>
        <p className="stage-card__insight">
          Requires management consulting inside insurance and asset management;
          the evidence here is ServiceNow, ITSM and business process consulting
          with no stated financial-services domain.
        </p>
        <div className="stage-tags">
          {["ITSM", "Business Process Consulting", "Team Leadership", "IT Operations"].map((tag) => (
            <span className="stage-tag" key={tag}>{tag}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "analysis",
    label: "Analyse",
    caption: "Requirement by requirement, each one answered or honestly marked as a gap.",
    body: (
      <div className="stage-card">
        <div className="stage-card__top">
          <span className="stage-card__employer">Requirement analysis</span>
          <span className="stage-chip">6 of 8 must-haves</span>
        </div>
        <ul className="stage-requirements">
          <li data-state="met">
            <span className="stage-dot" aria-hidden="true" />
            <span>10+ years leading enterprise delivery</span>
            <em>Evidenced</em>
          </li>
          <li data-state="met">
            <span className="stage-dot" aria-hidden="true" />
            <span>ServiceNow platform strategy</span>
            <em>Evidenced</em>
          </li>
          <li data-state="partial">
            <span className="stage-dot" aria-hidden="true" />
            <span>Commercial ownership of a P&amp;L</span>
            <em>Partial</em>
          </li>
          <li data-state="gap">
            <span className="stage-dot" aria-hidden="true" />
            <span>Financial services domain</span>
            <em>Gap</em>
          </li>
        </ul>
        <p className="stage-card__insight">
          A gap is reported as a gap. Nothing here is filled in on your behalf.
        </p>
      </div>
    ),
  },
  {
    id: "resume",
    label: "Résumé Studio",
    caption: "A master résumé, and a tailored version per role — every line citing its source.",
    body: (
      <div className="stage-card">
        <div className="stage-card__top">
          <span className="stage-card__employer">Tailored for Engagement Manager</span>
          <span className="stage-chip stage-chip--quiet">v3</span>
        </div>
        <div className="stage-resume">
          <p className="stage-resume__line">
            Led ServiceNow delivery for 14 enterprise clients across APAC.
            <span className="stage-cite">cites 2 approved items</span>
          </p>
          <p className="stage-resume__line">
            Rebuilt the ITSM operating model, cutting incident backlog by a third.
            <span className="stage-cite">cites 1 approved item</span>
          </p>
          <p className="stage-resume__line stage-resume__line--muted">
            Moved lower: pre-sales, which this advert never asks about.
            <span className="stage-cite">tailoring decision</span>
          </p>
        </div>
      </div>
    ),
  },
];

const ADVANCE_MS = 7000;

export function ProductCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const region = useRef<HTMLDivElement>(null);

  const go = useCallback((next: number) => {
    setActive((next + PANELS.length) % PANELS.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    /*
     * Somebody who has asked their system not to animate things is not asking
     * for a slideshow that moves on without them either. They get the first
     * panel and the buttons, which is the whole content.
     */
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (still.matches) return;

    const timer = window.setInterval(() => setActive((current) => (current + 1) % PANELS.length), ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") { go(active + 1); event.preventDefault(); }
    if (event.key === "ArrowLeft") { go(active - 1); event.preventDefault(); }
  };

  return (
    <section className="landing-stage" aria-labelledby="landing-stage-title">
      <div className="landing-stage__head">
        <h2 className="section-heading" id="landing-stage-title">See it work</h2>
        <p className="section-subtitle">{PANELS[active].caption}</p>
      </div>

      <div
        className="landing-stage__frame"
        ref={region}
        role="group"
        aria-roledescription="carousel"
        aria-label="What Sartho produces"
        tabIndex={0}
        onKeyDown={onKeyDown}
        /*
         * Paused while somebody is reading it. A panel that changes under a
         * person mid-sentence is the reason carousels are disliked.
         */
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {PANELS.map((panel, index) => (
          <div
            className="landing-stage__panel"
            key={panel.id}
            data-active={index === active}
            aria-hidden={index !== active}
            /*
             * Inert, not just invisible. An off-stage panel is still in the
             * document, so without this its links stay in the tab order and a
             * keyboard user tabs into a card nobody can see.
             */
            inert={index !== active}
          >
            {panel.body}
          </div>
        ))}
      </div>

      <div className="landing-stage__controls">
        {PANELS.map((panel, index) => (
          <button
            type="button"
            key={panel.id}
            className="landing-stage__tab"
            data-active={index === active}
            aria-current={index === active}
            onClick={() => go(index)}
          >
            {panel.label}
          </button>
        ))}
      </div>
    </section>
  );
}
