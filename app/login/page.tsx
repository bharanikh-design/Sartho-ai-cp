"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_ORIGIN, isAllowedAuthOrigin, resolveAuthOrigin } from "@/lib/site";
import sarthoIcon from "@/sartho.png";

/* The corridor, shared with the public home page. */
import { ENTRY_ART as entryArt } from "@/lib/brand/entry-art";


/*
 * Sign-in.
 *
 * Split composition: the promise holds the left, every way in sits on the
 * right. The brand lockup stays whole — mark, wordmark and tagline together —
 * because the front door is where identity should be most complete, not least.
 *
 * Styling runs on the shared design tokens, so the page follows the Dark/Light
 * switch along with the rest of the product.
 */

/*
 * Supabase names the LinkedIn provider "linkedin_oidc"; the bare "linkedin"
 * id is the retired OAuth 2.0 one and is rejected.
 */
const PROVIDERS = ["google", "apple", "linkedin_oidc"] as const;
type Provider = (typeof PROVIDERS)[number];
type Mode = "signin" | "reset";

const styles = `
.si {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: clamp(44px, 9vh, 96px);
  padding: clamp(22px, 3.2vw, 46px);
  color: var(--text);
  overflow: hidden;
}
/*
 * Colour, rather than a tint of it.
 *
 * One faint violet blur at 20% read as a smudge on an off-white page — the
 * palette was present but never actually seen. Three overlapping fields at
 * real strength give the page a light source: violet high on the left where
 * the headline sits, blue behind the card, and a warm low note underneath so
 * the wash is not a single hue stretched across the whole screen. All three
 * are mixed from the theme tokens, so the dark theme deepens where the light
 * theme brightens instead of needing a second set of colours.
 */
.si::before,
.si::after {
  content: "";
  position: absolute; z-index: 0;
  border-radius: 999px;
  pointer-events: none;
}
.si::before {
  top: -30%; left: -6%;
  width: min(88vw, 1000px); aspect-ratio: 1;
  background:
    radial-gradient(circle at 38% 42%, color-mix(in srgb, var(--violet) 62%, transparent), transparent 58%),
    radial-gradient(circle at 74% 20%, color-mix(in srgb, var(--blue) 44%, transparent), transparent 62%);
  filter: blur(60px);
  opacity: .72;
}
.si::after {
  right: -14%; bottom: -34%;
  width: min(80vw, 900px); aspect-ratio: 1;
  background:
    radial-gradient(circle at 46% 50%, color-mix(in srgb, var(--blue) 52%, transparent), transparent 60%),
    radial-gradient(circle at 24% 78%, color-mix(in srgb, var(--rose) 30%, transparent), transparent 64%);
  filter: blur(72px);
  opacity: .58;
}
/* The dark theme carries deeper colour before it turns to mud. */
:root[data-theme="dark"] .si::before { opacity: .5; }
:root[data-theme="dark"] .si::after { opacity: .42; }

/* Light mode needs contrast from tokens, not taste. */
:root[data-theme="light"] .si-proof,
:root[data-theme="light"] .si-note,
:root[data-theme="light"] .si-brand small,
:root[data-theme="light"] .si-or {
  color: var(--text-secondary);
}

/* The light palette is already bright; avoid the rose wash. */
:root[data-theme="light"] .si::after {
  background:
    radial-gradient(circle at 46% 50%, color-mix(in srgb, var(--blue) 52%, transparent), transparent 60%),
    radial-gradient(circle at 24% 78%, color-mix(in srgb, var(--violet) 30%, transparent), transparent 64%);
}

/*
 * Brand lockup — the first thing on the page, at full size, on its own.
 *
 * The mark is stated once and stated large. It used to appear twice on this
 * screen, small in the corner and again on the card, which is two half-strength
 * statements of the same thing; the card no longer carries a copy. What kept
 * the corner from working before was not the position but the column beneath
 * it drifting down against a taller card — the stage below now starts on the
 * card's line, so the space under the lockup is a margin rather than a hole.
 */
.si-brand {
  position: relative; z-index: 2;
  display: flex; align-items: center; gap: 16px;
  animation: siRise .8s ease both;
}
.si-logo {
  width: clamp(52px, 4vw, 64px); height: clamp(52px, 4vw, 64px);
  border-radius: 18px; flex: none;
}
.si-brand strong { display: block; font-size: clamp(22px, 1.9vw, 27px); font-weight: 660; letter-spacing: -0.032em; }
.si-brand small { display: block; margin-top: 4px; font-size: 13px; color: var(--text-tertiary); }

/* Stage */
/*
 * The headline starts on the card's line.
 *
 * This is the whole trick, and it is what centring the shorter column inside
 * the taller one's row got wrong: the card fills the row, so a centred pitch
 * begins a hundred and ninety pixels below it and the two columns read as
 * unrelated. Anchoring the pitch to the top of the row gives them a shared
 * edge, and what is left over collects below the shorter column, where it is
 * ordinary margin rather than a gap in the middle of the composition.
 */
.si-stage {
  position: relative; z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(340px, 430px);
  /*
   * One row, sized to its content and centred in whatever height is left.
   *
   * Left as 1fr the row swallowed the leftover space, so stretching the pitch
   * stretched it past the card rather than to it. Sized to content, the row is
   * exactly the card's height and both columns stretch to the same line.
   */
  grid-template-rows: auto;
  align-content: center;
  gap: clamp(38px, 6vw, 90px);
  align-items: stretch;
}

/*
 * The left column is given the card's height and spends it.
 *
 * The card is the taller of the two, so stretching the pitch to the row makes
 * both columns start and finish on the same lines; the lead sits at the top and
 * the proof line at the foot, with the slack collecting between them instead of
 * trailing off below a column that stopped early. The gap is the floor, so on a
 * short window the two blocks close up rather than overlapping.
 */
.si-pitch {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: clamp(28px, 5vh, 64px);
}

.si-pitch h1 {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(40px, 6.4vw, 92px);
  line-height: .94;
  letter-spacing: -0.05em;
  font-weight: 600;
  text-wrap: balance;
  animation: siRise 1s cubic-bezier(.2,.7,.2,1) .08s both;
}
.si-pitch h1 em {
  font-style: normal;
  text-shadow: 0 0 60px color-mix(in srgb, var(--violet) 50%, transparent);
}
.si-pitch p {
  /*
   * Body copy at a body-copy size. 15px with a 1.6 leading is interface text,
   * and this is a sentence someone is meant to read — 17-19px over a measure
   * of about 40 characters at 1.65 is where prose stops being a caption. The
   * space above it is set from viewport height so the headline and the
   * sentence stay two separate thoughts on any window.
   */
  max-width: 40ch;
  margin: clamp(38px, 8vh, 92px) 0 0;
  color: var(--text-secondary);
  font-size: clamp(16px, 1.35vw, 19px);
  line-height: 1.65;
  letter-spacing: -0.005em;
  animation: siRise 1s ease .18s both;
}

/*
 * What the headline is promising, in two or three words each — and the foot
 * the left column needs to hold its own beside the card.
 */
.si-proof {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 10px 14px;
  /* Lifted off the foot so it reads as the column's last line rather than
     something resting on the bottom edge. */
  margin: 0 0 clamp(20px, 3vh, 34px); padding: 0;
  list-style: none;
  color: var(--text-tertiary);
  font-size: 12.5px; font-weight: 560; letter-spacing: 0.055em; text-transform: uppercase;
  animation: siRise 1s ease .3s both;
}
.si-proof li { display: flex; align-items: center; gap: 14px; }
/*
 * The separator trails its own item rather than leading the next one. Owned by
 * the following item, a wrap carries the dot to the start of the new line and
 * the list reads as though it began with a bullet.
 */
.si-proof li:not(:last-child)::after {
  content: "";
  width: 3px; height: 3px;
  border-radius: 999px;
  background: currentColor;
  opacity: .6;
}

/* Panel */
.si-panel {
  position: relative;
  justify-self: end;
  width: 100%;
  padding: clamp(22px, 2.1vw, 28px);
  border: 1px solid var(--line);
  border-radius: 26px;
  background: var(--glass-strong);
  box-shadow:
    var(--shadow),
    0 0 90px -10px color-mix(in srgb, var(--violet) 42%, transparent),
    0 0 160px 10px color-mix(in srgb, var(--blue) 20%, transparent);
  backdrop-filter: blur(20px);
  animation: siRise 1s ease .26s both;
}
.si-panel h2 { margin: 0; font-size: 20px; font-weight: 640; letter-spacing: -0.026em; text-align: center; }
.si-sub { margin: 7px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; text-align: center; }

.si-providers { display: grid; gap: 8px; margin-top: 16px; }
.si-provider {
  width: 100%; min-height: 46px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  border: 1px solid var(--line-bright);
  border-radius: 13px;
  color: var(--text);
  background: color-mix(in srgb, var(--text) 5%, transparent);
  cursor: pointer; font: inherit;
  font-size: 14px; font-weight: 560;
  transition: background .2s ease, border-color .2s ease, transform .2s ease;
}
.si-provider:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--text) 28%, transparent);
  background: color-mix(in srgb, var(--text) 9%, transparent);
}
.si-provider:disabled { opacity: .55; cursor: progress; }
.si-provider svg { flex: none; }

.si-or {
  display: flex; align-items: center; gap: 12px;
  margin: 15px 0;
  color: var(--text-tertiary); font-size: 11.5px;
}
.si-or::before, .si-or::after { content: ""; height: 1px; flex: 1; background: var(--line); }

.si-form { display: grid; gap: 10px; }
.si-form label { display: grid; gap: 6px; }
.si-form label > span { font-size: 12px; font-weight: 560; color: var(--text-secondary); }
.si-form input {
  width: 100%; min-height: 46px;
  padding: 0 13px;
  border: 1px solid var(--line-bright);
  border-radius: 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--canvas) 55%, transparent);
  font-size: 14px;
  outline: none;
  transition: border-color .2s ease, box-shadow .2s ease;
}
.si-form input::placeholder { color: var(--text-tertiary); }
.si-form input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 18%, transparent);
}

.si-submit {
  width: 100%; min-height: 48px;
  margin-top: 3px;
  border: 0; border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, #7c5cf0, #5b7ff0);
  cursor: pointer; font: inherit;
  font-size: 14px; font-weight: 620;
  box-shadow: 0 10px 26px color-mix(in srgb, var(--violet) 34%, transparent);
  transition: transform .2s ease, filter .2s ease;
}
.si-submit:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
.si-submit:disabled { opacity: .55; cursor: progress; }

.si-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 12px; }
.si-link {
  border: 0; padding: 0; background: none;
  color: var(--blue); cursor: pointer; font: inherit;
  font-size: 12.5px;
}
.si-link:hover { text-decoration: underline; }

.si-msg {
  margin: 14px 0 0; padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 12.5px; line-height: 1.5;
}
.si-msg.is-error { border-color: color-mix(in srgb, var(--rose) 40%, transparent); color: var(--rose); background: color-mix(in srgb, var(--rose) 10%, transparent); }
.si-msg.is-ok { border-color: color-mix(in srgb, var(--mint) 40%, transparent); color: var(--mint); background: color-mix(in srgb, var(--mint) 10%, transparent); }

.si-note {
  margin: 14px 0 0; padding-top: 13px;
  border-top: 1px solid var(--line);
  color: var(--text-tertiary); font-size: 11.5px; line-height: 1.55; text-align: center;
}

.si :is(button, a, input):focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }

/* ---- the landing screen -------------------------------------------------- */
/*
 * This is a screen, not a transition. It arrives, it settles, and then it
 * holds — indefinitely — until the visitor presses Continue. Nothing here is
 * on a timer, because a screen nobody gets to read is a screen nobody built.
 */
/*
 * Laid out as a flow column rather than absolutely positioned pieces. The
 * centring transform an absolute layout needs collides with the transforms the
 * entrance animations run, and the animation wins — which is exactly how the
 * headline and the button ended up half a width off centre.
 */
.si-splash {
  position: fixed; inset: 0; z-index: 60;
  display: flex; flex-direction: column;
  align-items: center; justify-content: space-between;
  gap: clamp(20px, 4vh, 48px);
  padding: clamp(30px, 7vh, 96px) 24px clamp(28px, 6vh, 76px);
  background: #04050a;
  overflow: hidden;
}
.si-splash.is-leaving { animation: splashOut .6s ease .38s forwards; }

/*
 * The corridor.
 *
 * This is the artwork itself, not a drawing of it — the lit doorway at the end
 * of a floor running away to a vanishing point. A doorway only reads as a
 * doorway when something leads to it; the perspective is the whole idea, and
 * the opening is small because it is far away.
 *
 * Painted as a backdrop behind the words, never in the content flow, so it can
 * never crowd the headline or the button no matter the window.
 */
.si-scene {
  position: absolute; left: 50%; top: 66%;
  z-index: 0;
  /*
   * The whole frame, fitted to the height rather than cropped to fill. The
   * artwork is 4:3 and a laptop window is closer to 2:1, so filling the frame
   * ate the edges and enlarged the doorway until it loomed — precisely the
   * quality that had to be designed out. Its own edges are already near-black,
   * so masking them into the page reads as a lit scene in a dark room.
   */
  /*
   * Sat low and a little under full height: the doorway falls near the top of
   * the artwork, and at dead centre it collided with the last line of the
   * headline on a short window. It sits lower again now that the lockup lives
   * under the headline — the doorway is the brightest thing on the screen and
   * a wordmark laid over it simply disappears.
   */
  height: 96%;
  aspect-ratio: 2200 / 1675;
  transform: translate(-50%, -50%);
  /* the zoom on exit runs into the doorway, not the middle of the frame */
  transform-origin: 50% 46%;
  background-image: url("${entryArt}");
  background-size: cover;
  background-position: 50% 50%;
  background-repeat: no-repeat;
  /*
   * Faded on all four edges, not just the sides.
   *
   * Sitting lower puts the artwork's top edge inside the visible area with a
   * lit wall immediately below it, and a hard cut between near-black and a lit
   * wall is a seam no amount of scrim covers. Two masks intersected fade the
   * frame out on every side, so it reads as light in a dark room rather than
   * as a picture pasted onto the page.
   */
  -webkit-mask-image:
    linear-gradient(to right, transparent 0, #000 10%, #000 90%, transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 15%, #000 86%, transparent 100%);
  -webkit-mask-composite: source-in;
          mask-image:
    linear-gradient(to right, transparent 0, #000 10%, #000 90%, transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 15%, #000 86%, transparent 100%);
          mask-composite: intersect;
  pointer-events: none;
  animation: sceneIn 1.6s ease .2s both;
}
/*
 * The words sit on top of a photograph, so the top and bottom are pulled down
 * to hold them. The middle is left alone — that is where the light is, and
 * dimming it would be dimming the only thing worth looking at.
 */
.si-splash::before {
  content: "";
  position: absolute; inset: 0;
  z-index: 1;
  background: linear-gradient(to bottom,
    rgba(4,5,10,.88) 0%, rgba(4,5,10,.5) 20%, rgba(4,5,10,.1) 42%,
    rgba(4,5,10,.3) 66%, rgba(4,5,10,.92) 100%);
  pointer-events: none;
}

.si-splash-line {
  position: relative; z-index: 2;
  margin: 0;
  width: min(92vw, 14ch);
  text-align: center;
  font-size: clamp(34px, 6.4vw, 92px);
  line-height: .96;
  letter-spacing: -0.05em;
  font-weight: 600;
  color: #f4f6ff;
  text-wrap: balance;
  animation: siRise 1.1s cubic-bezier(.2,.7,.2,1) .3s both;
}
.si-splash-line em {
  font-style: normal;
  text-shadow: 0 0 64px rgba(150,130,255,.75);
}

/*
 * The name sits under the sentence it signs, above the doorway.
 *
 * It used to stack with the button at the foot, which put two things asking
 * for attention in the same place and made the way in the second of them.
 * Alone at the bottom, the button is the only thing down there to press.
 */
.si-splash-head {
  position: relative; z-index: 2;
  display: grid; justify-items: center;
  gap: clamp(18px, 2.8vh, 34px);
}
.si-splash-foot {
  position: relative; z-index: 2;
  display: grid; justify-items: center;
  animation: siRise 1.1s ease .62s both;
}
.si-splash-lockup {
  display: flex; align-items: center; gap: 12px;
  animation: siRise 1.1s ease .5s both;
}
.si-splash-lockup img { width: 46px; height: 46px; border-radius: 13px; flex: none; }
.si-splash-lockup strong { display: block; font-size: 21px; font-weight: 650; letter-spacing: -0.028em; color: #f4f6ff; }
.si-splash-lockup small { display: block; margin-top: 3px; font-size: 12.5px; color: rgba(226,232,255,.5); }

.si-splash-enter {
  min-height: 50px;
  padding: 0 30px;
  border: 0; border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, #7c5cf0, #5b7ff0);
  cursor: pointer; font: inherit;
  font-size: 14.5px; font-weight: 620; letter-spacing: -0.01em;
  box-shadow: 0 12px 34px rgba(124,92,240,.42);
  transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
}
.si-splash-enter:hover {
  transform: translateY(-2px);
  filter: brightness(1.09);
  box-shadow: 0 18px 44px rgba(124,92,240,.52);
}
.si-splash-enter:focus-visible { outline: 2px solid #9fb6ff; outline-offset: 3px; }

.si-splash::after {
  content: "";
  position: absolute; inset: 0;
  z-index: 3;
  background: radial-gradient(circle at 50% 46%, #ffffff, rgba(214,226,255,.7) 34%, transparent 72%);
  opacity: 0;
  pointer-events: none;
}
.si-splash.is-leaving::after { animation: bloom .9s ease-out .1s forwards; }

/*
 * The exit: you walk down the corridor and through the opening. The words
 * clear first so nothing is in the way, then the door rushes up to meet you.
 */
.si-splash.is-leaving .si-splash-line { animation: lineThrough .8s cubic-bezier(.6,0,.75,.2) forwards; }
.si-splash.is-leaving .si-splash-foot,
.si-splash.is-leaving .si-splash-lockup { animation: splashLift .4s ease forwards; }
.si-splash.is-leaving .si-scene { animation: sceneThrough .95s cubic-bezier(.7,0,.85,.2) forwards; }

/*
 * The landing screen stays dark in both themes. The artwork is a photograph of
 * a lit doorway in an unlit room — there is no light-mode version of it, and
 * laying light-mode type over it makes the words unreadable. The exit bloom
 * washes to white, which is what carries a light-mode visitor across to the
 * sign-in page rather than dropping them off a cliff.
 */

@keyframes splashLift { to { opacity: 0; transform: translateY(-10px); } }
@keyframes lineThrough {
  0%   { transform: scale(1); opacity: 1; filter: blur(0); }
  100% { transform: scale(1.3); opacity: 0; filter: blur(7px); }
}
@keyframes sceneIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes sceneThrough {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(5.5); opacity: 0; }
}
@keyframes bloom {
  0%   { opacity: 0; }
  42%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes splashOut { to { opacity: 0; visibility: hidden; } }

@keyframes siRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

@media (max-width: 940px) {
  .si-stage { grid-template-columns: 1fr; gap: 30px; align-items: start; }
  /* Stacked: no second column to match, so the row goes back to flowing. */
  .si-stage { grid-template-rows: none; align-content: start; }
  .si-panel { justify-self: stretch; align-self: start; }
  .si-pitch { display: block; }
  .si-pitch p { margin-top: 24px; }
  .si-proof { margin-top: 28px; font-size: 11.5px; }
  .si-pitch h1 { max-width: none; font-size: clamp(34px, 8vw, 52px); }
  .si-splash { padding: clamp(32px, 7vh, 72px) 22px clamp(28px, 6vh, 64px); }
  .si-splash-head { gap: 24px; }
}
/*
 * Short windows — a laptop with browser chrome and a taskbar taking their cut.
 * The headline comes down with everything else so it never crowds the way in.
 */
/*
 * A sign-in card carrying three providers, an email pair and a footnote is
 * about 690px however it is packed, so on a short window the room has to come
 * from around it rather than out of it. The page chrome gives up its padding
 * before the card gives up a button — a card cut off at the fold is the worst
 * of the available outcomes.
 */
@media (max-height: 880px) and (min-width: 941px) {
  /* Height is what is scarce, so only the vertical measurements give way. */
  .si { padding: clamp(16px, 2.2vh, 30px) clamp(24px, 3.2vw, 46px); gap: clamp(30px, 6vh, 56px); }
  .si-logo { width: 48px; height: 48px; border-radius: 15px; }
  .si-brand strong { font-size: 22px; }
  .si-panel { padding: clamp(20px, 1.8vw, 26px); }
}
@media (max-height: 720px) {
  .si-splash-line { font-size: clamp(28px, 5vw, 62px); }
  .si-splash-head { gap: 22px; }
  .si-splash-enter { min-height: 46px; }
}
@media (max-height: 560px) {
  .si-splash-line { font-size: clamp(24px, 4vw, 46px); }
  .si-splash-lockup img { width: 34px; height: 34px; }
  .si-splash-head { gap: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  /*
   * The landing screen still shows — it is content, and it waits on a click
   * either way. Only the motion goes.
   */
  .si *, .si-splash, .si-splash * { animation: none !important; transition: none !important; }
  .si-splash.is-leaving { opacity: 0; visibility: hidden; }
}
`;

function friendlyAuthMessage(message: string) {
  const value = message.toLowerCase();

  if (value.includes("invalid api key")) {
    return "Sartho cannot reach its secure sign-in service yet. The Supabase connection saved in this deployment needs one correction.";
  }

  if (value.includes("unsupported provider") || value.includes("provider is not enabled")) {
    return "That sign-in method has not been switched on for Sartho yet. Enable it in Supabase, then try again.";
  }

  if (
    value.includes("unable to exchange external code") ||
    value.includes("invalid_client") ||
    value.includes("client secret")
  ) {
    return "The provider accepted your account, but Supabase could not complete the secure code exchange. The client secret saved in Supabase does not match this client ID.";
  }

  /*
   * /auth/callback rewrites this one before it reaches the page, so this branch
   * is for the copy that never goes through the callback — a failure the
   * browser client raises on its own.
   */
  if (value.includes("code verifier") || value.includes("code_verifier")) {
    const canonical = AUTH_ORIGIN.replace(/^https?:\/\//, "");
    return `This sign-in started on a different address than it finished on, so the browser could not prove the round trip was yours. Start again from ${canonical} and it will complete.`;
  }

  return message;
}

/*
 * The page's metadata lives in ./layout.tsx. Next disallows a `metadata` export
 * from a "use client" component, and exporting it here failed the build.
 */
export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [splash, setSplash] = useState<"showing" | "leaving" | "done">("showing");

  useEffect(() => {
    /*
     * The entry screen is the front door: it shows on every arrival at this
     * page, not once and then never again.
     *
     * It used to be suppressed for the rest of the browser session once you had
     * walked through it. That made the screen render for a single frame and
     * then vanish on every later visit — it read as a flash and a glitch rather
     * than a screen, and it meant the main URL behaved differently depending on
     * invisible state nobody could see or clear.
     *
     * The one case it still steps aside for is the return leg of an auth round
     * trip, decided on the parameters a provider actually sends back. A visitor
     * mid sign-in is already through the door; putting one in front of them
     * again is an obstacle.
     */
    const roundTripKeys = [
      "code",
      "error",
      "error_code",
      "error_description",
      "access_token",
      "refresh_token",
      "token_hash",
      "type",
      // A handoff from another host is mid sign-in too: it leaves for Google
      // the moment it lands, so a front door here is a door onto nothing.
      "resume",
    ];
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const midRoundTrip = roundTripKeys.some((key) => query.has(key) || hash.has(key));

    // Reads browser-only URL state unavailable during SSR, so it has to settle
    // in an effect rather than during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (midRoundTrip) setSplash("done");
  }, []);

  useEffect(() => {
    if (splash === "done") return;

    /*
     * The landing screen covers the viewport, but the sign-in page underneath
     * is taller than a short window and stays scrollable — which puts a
     * scrollbar down the side of a full-bleed screen and lets the wheel drag
     * the hidden page around. Locking the body removes the scrollbar, so its
     * width is handed back as padding to stop the page shifting sideways.
     */
    const root = document.documentElement;
    const body = document.body;
    const scrollbar = window.innerWidth - root.clientWidth;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;

    // Both elements: overflow on body alone stops the wheel but leaves the
    // viewport scrollbar drawn, because that scrollbar belongs to the root.
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [splash]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const failure =
      hashParams.get("error_description") ??
      searchParams.get("error") ??
      hashParams.get("error");

    // Reads browser-only URL/hash params unavailable during SSR, so this must
    // run in an effect rather than being derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (failure) setError(friendlyAuthMessage(failure));

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router, supabase]);

  /*
   * Picks up a sign-in that began on another host.
   *
   * signInWithProvider sends the browser here when it cannot finish where it
   * started, and the click has to survive that move or the user is left staring
   * at a page that looks exactly like the one they just pressed a button on.
   * The parameter is cleared from the URL first, so a reload or a back button
   * never launches a second round trip.
   */
  useEffect(() => {
    const resume = new URLSearchParams(window.location.search).get("resume");
    if (!resume || !PROVIDERS.includes(resume as Provider)) return;

    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete("resume");
    window.history.replaceState(null, "", cleaned.toString());

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(resume);

    supabase.auth
      .signInWithOAuth({
        provider: resume as Provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
          queryParams: resume === "google" ? { prompt: "select_account" } : undefined,
        },
      })
      .then(({ error: failure }) => {
        if (!failure) return;
        setBusy(null);
        setError(friendlyAuthMessage(failure.message));
      });
  }, [supabase]);

  // While the entry screen is up, nothing behind it should be reachable.
  const covered = splash !== "done";

  // The only way past the landing screen. Nothing else dismisses it.
  function walkThrough() {
    if (splash !== "showing") return;
    setSplash("leaving");
    window.setTimeout(() => setSplash("done"), 980);
  }

  /*
   * Both legs of a sign-in have to run on one origin.
   *
   * The redirect target used to be pinned to AUTH_ORIGIN no matter where the
   * button was pressed. Press it on www.sartho.tech, or on the vercel.app
   * deployment, and the PKCE code verifier is written into a cookie for that
   * host while Google returns to the apex, which never receives it — the
   * callback then fails with "PKCE code verifier not found in storage" and the
   * user is bounced back here with no way to get past it. Sending the browser
   * to the canonical origin *before* the round trip starts is the fix; sending
   * it there afterwards is the bug.
   */
  async function signInWithProvider(provider: Provider) {
    setBusy(provider);
    setError(null);
    setNotice(null);

    const origin = window.location.origin;

    if (!isAllowedAuthOrigin(origin)) {
      // Leaves this host entirely, then resumes the same click on the other
      // side. `resume` is read once on arrival, and the canonical origin is
      // allowed by definition, so this cannot bounce twice.
      const handoff = new URL("/login", resolveAuthOrigin(origin));
      handoff.searchParams.set("resume", provider);
      window.location.replace(handoff.toString());
      return;
    }

    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback?next=/`,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });

    if (failure) {
      setBusy(null);
      setError(friendlyAuthMessage(failure.message));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "reset") {
      setBusy("reset");
      // Same rule as OAuth: the recovery link has to land back on the origin
      // that asked for it, or the session it carries is exchanged nowhere.
      const { error: failure } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${resolveAuthOrigin(window.location.origin)}/auth/callback?next=/update-password`,
      });
      setBusy(null);
      if (failure) setError(friendlyAuthMessage(failure.message));
      else setNotice("If that address has an account, a reset link is on its way.");
      return;
    }

    setBusy("email");
    const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(null);
    if (failure) setError(friendlyAuthMessage(failure.message));
    else router.replace("/");
  }

  return (
    <main className="si">
      <style>{styles}</style>

      {splash !== "done" ? (
        <div className={`si-splash${splash === "leaving" ? " is-leaving" : ""}`}>
          <div className="si-scene" aria-hidden="true" />

          {/* Head and foot, so space-between has two things to separate. The
              lockup belongs to the sentence it signs, not to the button. */}
          <div className="si-splash-head">
            <h1 className="si-splash-line">
              Your own headhunter. <em>Finally.</em>
            </h1>
            <span className="si-splash-lockup">
              <Image src={sarthoIcon} alt="" width={152} height={152} quality={95} priority />
              <span>
                <strong>Sartho</strong>
                <small>Your Career CoPilot</small>
              </span>
            </span>
          </div>

          <div className="si-splash-foot">
            <button type="button" className="si-splash-enter" onClick={walkThrough}>
              Continue to Sign In
            </button>
          </div>
        </div>
      ) : null}

      {/*
        * Everything behind the entry screen is switched off while it is up.
        * The sign-in form stays mounted underneath, so without this a keyboard
        * user can Tab straight past Continue into provider buttons they cannot
        * see, and a screen reader is handed both screens at once.
        */}
      <header className="si-brand" inert={covered}>
        <Image className="si-logo" src={sarthoIcon} alt="" width={256} height={256} quality={95} priority />
        <span>
          <strong>Sartho</strong>
          <small>Your Career CoPilot</small>
        </span>
      </header>

      <div className="si-stage" inert={covered}>
        <section className="si-pitch">
          {/* Grouped, so space-between puts the foot at the foot rather than
              floating the sentence away from the headline it belongs to. */}
          <div className="si-pitch-lead">
            <h1>Your own headhunter. <em>Finally.</em></h1>
            <p>
              Someone who knows your whole career, finds the roles worth your
              experience, and makes sure you walk in ready.
            </p>
          </div>

          <ul className="si-proof">
            <li>Role matching</li>
            <li>Résumé tailoring</li>
            <li>Interview preparation</li>
          </ul>
        </section>

        <section className="si-panel">
          <h2>{mode === "reset" ? "Reset your password" : "Welcome to Sartho"}</h2>
          <p className="si-sub">
            {mode === "reset"
              ? "We'll email you a link to set a new one."
              : "Choose how you'd like to sign in."}
          </p>

          {mode === "signin" ? (
            <>
              <div className="si-providers">
                <button type="button" className="si-provider" onClick={() => signInWithProvider("google")} disabled={busy !== null}>
                  <GoogleIcon /><span>{busy === "google" ? "Opening…" : "Continue with Google"}</span>
                </button>

                <button type="button" className="si-provider" onClick={() => signInWithProvider("linkedin_oidc")} disabled={busy !== null}>
                  <LinkedInIcon /><span>{busy === "linkedin_oidc" ? "Opening…" : "Continue with LinkedIn"}</span>
                </button>
              </div>

              <div className="si-or">or</div>
            </>
          ) : null}

          <form className="si-form" onSubmit={submit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            {mode === "signin" ? (
              <label>
                <span>Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            ) : null}

            <button type="submit" className="si-submit" disabled={busy !== null}>
              {busy === "email" || busy === "reset"
                ? "Working…"
                : mode === "reset"
                  ? "Send reset link"
                  : "Sign in"}
            </button>
          </form>

          <div className="si-row">
            <button
              type="button"
              className="si-link"
              onClick={() => {
                setMode(mode === "reset" ? "signin" : "reset");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "reset" ? "Back to sign in" : "Forgot password?"}
            </button>
          </div>

          {error ? <p className="si-msg is-error" role="alert">{error}</p> : null}
          {notice ? <p className="si-msg is-ok" role="status">{notice}</p> : null}

          <p className="si-note">
            Private beta — approved accounts only. Nothing is submitted without your approval.
          </p>
        </section>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.94A6.02 6.02 0 0 1 6.1 12c0-.67.12-1.33.31-1.94V7.44H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.56l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.44l3.35 2.62C7.2 7.7 9.4 5.94 12 5.94Z" />
    </svg>
  );
}


function LinkedInIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13M7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0" />
    </svg>
  );
}
