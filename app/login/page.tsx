"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import sarthoIcon from "@/sartho.png";
import { entryArt } from "./entry-art";

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

type Provider = "google" | "apple" | "github";
type Mode = "signin" | "reset";

const styles = `
.si {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: clamp(22px, 3vw, 38px);
  padding: clamp(22px, 3.2vw, 46px);
  color: var(--text);
  overflow: hidden;
}
.si::before {
  content: "";
  position: absolute; z-index: 0;
  top: -32%; left: 4%;
  width: min(72vw, 820px); aspect-ratio: 1;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--violet) 20%, transparent), transparent 64%);
  filter: blur(44px);
  pointer-events: none;
}

/* Brand lockup — kept whole. */
.si-brand {
  position: relative; z-index: 2;
  display: flex; align-items: center; gap: 13px;
  animation: siRise .8s ease both;
}
.si-logo { width: 46px; height: 46px; border-radius: 13px; flex: none; }
.si-brand strong { display: block; font-size: 21px; font-weight: 650; letter-spacing: -0.028em; }
.si-brand small { display: block; margin-top: 3px; font-size: 12.5px; color: var(--text-tertiary); }

/* Stage */
.si-stage {
  position: relative; z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(340px, 430px);
  gap: clamp(38px, 6vw, 90px);
  align-items: center;
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
  max-width: 40ch;
  margin: clamp(18px, 2vw, 26px) 0 0;
  color: var(--text-secondary);
  font-size: clamp(15px, 1.3vw, 17px);
  line-height: 1.6;
  animation: siRise 1s ease .18s both;
}

/* Panel */
.si-panel {
  position: relative;
  justify-self: end;
  width: 100%;
  padding: clamp(24px, 2.6vw, 34px);
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
/* The mark crowns the card — the door you are about to walk through. */
.si-card-mark {
  display: block;
  width: 54px; height: 54px;
  margin: 0 auto 16px;
  border-radius: 15px;
}
.si-panel h2 { margin: 0; font-size: 20px; font-weight: 640; letter-spacing: -0.026em; text-align: center; }
.si-sub { margin: 7px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; text-align: center; }

.si-providers { display: grid; gap: 9px; margin-top: 20px; }
.si-provider {
  width: 100%; min-height: 48px;
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
  margin: 18px 0;
  color: var(--text-tertiary); font-size: 11.5px;
}
.si-or::before, .si-or::after { content: ""; height: 1px; flex: 1; background: var(--line); }

.si-form { display: grid; gap: 11px; }
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

.si-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 13px; }
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
  margin: 16px 0 0; padding-top: 15px;
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
  position: absolute; left: 50%; top: 58%;
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
   * headline on a short window.
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
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 10%, #000 90%, transparent 100%);
          mask-image: linear-gradient(to right, transparent 0, #000 10%, #000 90%, transparent 100%);
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

/* brand lockup + the way in, together at the foot of the corridor */
.si-splash-foot {
  position: relative; z-index: 2;
  display: grid; justify-items: center; gap: 24px;
  animation: siRise 1.1s ease .62s both;
}
.si-splash-lockup { display: flex; align-items: center; gap: 12px; }
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
.si-splash.is-leaving .si-splash-foot { animation: splashLift .4s ease forwards; }
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
  .si-panel { justify-self: stretch; }
  .si-pitch h1 { max-width: none; font-size: clamp(34px, 8vw, 52px); }
  .si-splash { padding: clamp(32px, 7vh, 72px) 22px clamp(28px, 6vh, 64px); }
  .si-splash-foot { gap: 20px; }
}
/*
 * Short windows — a laptop with browser chrome and a taskbar taking their cut.
 * The headline comes down with everything else so it never crowds the way in.
 */
@media (max-height: 720px) {
  .si-splash-line { font-size: clamp(28px, 5vw, 62px); }
  .si-splash-foot { gap: 18px; }
  .si-splash-enter { min-height: 46px; }
}
@media (max-height: 560px) {
  .si-splash-line { font-size: clamp(24px, 4vw, 46px); }
  .si-splash-lockup img { width: 34px; height: 34px; }
  .si-splash-foot { gap: 14px; }
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

  return message;
}

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
    // The landing screen is shown once per session, and never when the page is
    // a return leg from an OAuth round trip — the visitor is mid-sign-in then,
    // and a front door in the middle of a journey is an obstacle.
    const returning =
      window.sessionStorage.getItem("sartho-entered") === "1" ||
      window.location.hash.length > 1 ||
      window.location.search.length > 1;

    // Reads browser-only session/URL state unavailable during SSR, so it has to
    // settle in an effect rather than during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (returning) setSplash("done");
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

  // The only way past the landing screen. Nothing else dismisses it.
  function walkThrough() {
    if (splash !== "showing") return;
    window.sessionStorage.setItem("sartho-entered", "1");
    setSplash("leaving");
    window.setTimeout(() => setSplash("done"), 980);
  }

  async function signInWithProvider(provider: Provider) {
    setBusy(provider);
    setError(null);
    setNotice(null);

    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
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
      const { error: failure } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
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
          <h1 className="si-splash-line">
            Your own headhunter. <em>Finally.</em>
          </h1>
          <div className="si-splash-foot">
            <span className="si-splash-lockup">
              <Image src={sarthoIcon} alt="" width={152} height={152} quality={95} priority />
              <span>
                <strong>Sartho</strong>
                <small>Your Career CoPilot</small>
              </span>
            </span>
            <button type="button" className="si-splash-enter" onClick={walkThrough}>
              Continue to Sign In
            </button>
          </div>
        </div>
      ) : null}

      <header className="si-brand">
        <Image className="si-logo" src={sarthoIcon} alt="" width={184} height={184} quality={95} priority />
        <span>
          <strong>Sartho</strong>
          <small>Your Career CoPilot</small>
        </span>
      </header>

      <div className="si-stage">
        <section className="si-pitch">
          <h1>Your own headhunter. <em>Finally.</em></h1>
          <p>
            Someone who knows your whole career, finds the roles worth your
            experience, and makes sure you walk in ready.
          </p>
        </section>

        <section className="si-panel">
          <Image className="si-card-mark" src={sarthoIcon} alt="" width={216} height={216} quality={95} />
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
                <button type="button" className="si-provider" onClick={() => signInWithProvider("apple")} disabled={busy !== null}>
                  <AppleIcon /><span>{busy === "apple" ? "Opening…" : "Continue with Apple"}</span>
                </button>
                <button type="button" className="si-provider" onClick={() => signInWithProvider("github")} disabled={busy !== null}>
                  <GitHubIcon /><span>{busy === "github" ? "Opening…" : "Continue with GitHub"}</span>
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

function AppleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.36 12.72c.02 2.6 2.28 3.47 2.3 3.48-.02.06-.36 1.24-1.19 2.45-.72 1.05-1.47 2.1-2.65 2.12-1.16.02-1.53-.69-2.86-.69-1.32 0-1.74.67-2.83.71-1.14.04-2.01-1.13-2.73-2.18-1.48-2.15-2.61-6.07-1.09-8.72.75-1.31 2.1-2.15 3.57-2.17 1.11-.02 2.17.75 2.85.75.68 0 1.96-.93 3.3-.79.56.02 2.14.23 3.15 1.71-.08.05-1.88 1.1-1.86 3.33M14.2 4.9c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.55 1.31-.56.65-1.05 1.68-.92 2.68.97.07 1.96-.49 2.57-1.23" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.8c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10Z" />
    </svg>
  );
}
