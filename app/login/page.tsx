"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import sarthoIcon from "@/sartho.png";
import { createClient } from "@/lib/supabase";

/*
 * Sign-in — the product's front door.
 *
 * Restrained violet on near-black, aligned to the app's existing tokens. Applied
 * sparingly (mark, active stage, focus, CTA) so it reads considered
 * rather than gaudy. The journey strip animates through the five stages so the
 * page feels alive without a carousel's weight.
 *
 * Copy is deliberately sparse — the tagline sits with the mark, the headline is
 * one line, and the card says only what the moment needs.
 *
 * Styles are inlined so this page can be deployed as a single file.
 */
const styles = `
.signin {
  --accent: #a68cff;
  --accent-deep: #6f8cf5;
  position: relative;
  width: min(100%, 1280px);
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: clamp(24px, 4vw, 44px);
  padding: clamp(22px, 4vw, 56px);
  color: var(--text, #f7f8fb);
  isolation: isolate;
}

/* A single cool wash, low and slow — depth without noise. */
.signin::before {
  content: "";
  position: absolute;
  z-index: -1;
  top: -18%; left: 42%;
  width: min(70vw, 780px); aspect-ratio: 1;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(139,124,246,.16), transparent 62%);
  filter: blur(28px);
  animation: drift 26s ease-in-out infinite alternate;
}

/* Masthead */
.signin-top { display: flex; align-items: center; gap: 13px; animation: rise .6s ease both; }
.signin-logo { width: 46px; height: 46px; border-radius: 13px; }
.signin-top strong { display: block; font-size: 17px; font-weight: 650; letter-spacing: -0.02em; }
.signin-top small {
  display: block; margin-top: 3px;
  font-size: 12.5px; letter-spacing: .005em;
  color: var(--text-tertiary, rgba(239,242,249,.48));
}

/* Stage */
.signin-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(350px, .78fr);
  gap: clamp(36px, 6vw, 84px);
  align-items: center;
}

.signin-intro h1 {
  margin: 0;
  max-width: 13ch;
  font-size: clamp(36px, 4.9vw, 60px);
  line-height: 1.03;
  letter-spacing: -0.036em;
  font-weight: 640;
  text-wrap: balance;
  animation: rise .7s ease .06s both;
}
.signin-intro h1 em {
  font-style: normal;
  background: linear-gradient(100deg, #b6a4ff, #cfc4ff 50%, #7f9cf7);
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
}

/* Journey strip — cycles so the page has a pulse */
.signin-stages {
  display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
  margin-top: clamp(30px, 3.4vw, 42px);
  animation: rise .7s ease .14s both;
}
.signin-stages span {
  position: relative;
  display: inline-flex; align-items: center; min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--line, rgba(255,255,255,.1));
  border-radius: 999px;
  background: rgba(255,255,255,.03);
  color: var(--text-tertiary, rgba(239,242,249,.46));
  font-size: 12.5px; font-weight: 600;
  animation: stageOn 11s linear infinite;
  animation-delay: calc(var(--i) * 2.2s);
}
.signin-stages i {
  position: relative;
  width: 20px; height: 1px;
  background: rgba(255,255,255,.12);
  overflow: hidden;
}
.signin-stages i::after {
  content: "";
  position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--accent-deep), var(--accent));
  transform: scaleX(0); transform-origin: left;
  animation: linkOn 11s linear infinite;
  animation-delay: calc(var(--i) * 2.2s);
}

/* Card */
.signin-card {
  justify-self: end;
  width: 100%;
  max-width: 410px;
  padding: clamp(26px, 3vw, 34px);
  border: 1px solid var(--line, rgba(255,255,255,.1));
  border-radius: 24px;
  background: var(--glass-strong, rgba(16,20,29,.82));
  box-shadow: 0 26px 74px rgba(0,0,0,.4);
  backdrop-filter: blur(18px);
  animation: rise .7s ease .2s both;
}
.signin-card h2 {
  margin: 0;
  font-size: 23px; line-height: 1.15;
  letter-spacing: -0.028em; font-weight: 640;
}

.signin-google {
  width: 100%; min-height: 52px;
  display: flex; align-items: center; justify-content: center; gap: 11px;
  margin-top: 22px;
  border: 1px solid rgba(166,140,255,.3);
  border-radius: 14px;
  color: #f8f9fc;
  background: rgba(166,140,255,.08);
  cursor: pointer; font: inherit;
  font-size: 15px; font-weight: 600;
  transition: background .22s ease, border-color .22s ease, transform .22s ease, box-shadow .22s ease;
}
.signin-google:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(166,140,255,.5);
  background: rgba(166,140,255,.14);
  box-shadow: 0 10px 30px rgba(124,108,240,.22);
}
.signin-google:disabled { opacity: .6; cursor: progress; }
.signin-google svg { flex: none; }

.signin-note {
  margin: 15px 0 0;
  color: var(--text-tertiary, rgba(239,242,249,.44));
  font-size: 12.5px; text-align: center;
}
.signin-error {
  margin: 18px 0 0; padding: 12px 14px;
  border: 1px solid rgba(255,142,163,.24);
  border-radius: 12px;
  color: #ffc2ce; background: rgba(255,142,163,.08);
  font-size: 13px; line-height: 1.55;
}

.signin-foot {
  display: flex; align-items: center; gap: 8px;
  color: var(--text-tertiary, rgba(239,242,249,.44));
  font-size: 12.5px;
  animation: rise .7s ease .26s both;
}
.signin-foot i {
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(166,140,255,.75);
}

.signin :is(button, a):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes drift { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(-4%, 3%, 0) scale(1.08); } }
@keyframes stageOn {
  0%, 18%, 100% {
    border-color: var(--line, rgba(255,255,255,.1));
    background: rgba(255,255,255,.03);
    color: var(--text-tertiary, rgba(239,242,249,.46));
  }
  3%, 15% {
    border-color: rgba(166,140,255,.45);
    background: rgba(166,140,255,.14);
    color: #ded6ff;
  }
}
@keyframes linkOn {
  0%, 100% { transform: scaleX(0); }
  4% { transform: scaleX(0); }
  15%, 82% { transform: scaleX(1); }
}

@media (max-width: 940px) {
  .signin-grid { grid-template-columns: 1fr; gap: 30px; align-items: start; }
  .signin-card { justify-self: stretch; max-width: none; }
  .signin-intro h1 { max-width: none; font-size: clamp(33px, 7.4vw, 48px); }
}
@media (max-width: 560px) {
  .signin { gap: 20px; }
  .signin-stages i { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .signin *, .signin::before { animation: none !important; transition: none !important; }
  .signin-stages span:first-child {
    border-color: rgba(166,140,255,.45);
    background: rgba(166,140,255,.14);
    color: #ded6ff;
  }
}
`;

const stages = ["Discover", "Align", "Stand out", "Prepare", "Land it"];

function friendlyAuthMessage(message: string) {
  const value = message.toLowerCase();

  if (value.includes("invalid api key")) {
    return "Sartho cannot reach its secure sign-in service yet. The Supabase connection saved in this deployment needs one correction.";
  }

  if (value.includes("unsupported provider") || value.includes("provider is not enabled")) {
    return "Google sign-in has not been enabled for Sartho yet. Complete the one-time Google connection in Supabase, then try again.";
  }

  if (
    value.includes("unable to exchange external code") ||
    value.includes("invalid_client") ||
    value.includes("client secret")
  ) {
    return "Google accepted your account, but Supabase could not complete the secure code exchange. The Google Client Secret saved in Supabase does not match this Client ID.";
  }

  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const error =
      hashParams.get("error_description") ??
      searchParams.get("error") ??
      hashParams.get("error");

    // Reads browser-only URL/hash params unavailable during SSR, so this must
    // run in an effect rather than being derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (error) setMessage(friendlyAuthMessage(error));

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router, supabase]);

  async function signInWithGoogle() {
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (error) {
      setBusy(false);
      setMessage(friendlyAuthMessage(error.message));
    }
  }

  return (
    <main className="signin">
      <style>{styles}</style>

      <header className="signin-top">
        <Image className="signin-logo" src={sarthoIcon} alt="" width={46} height={46} priority />
        <span>
          <strong>Sartho</strong>
          <small>Your career, intelligently guided.</small>
        </span>
      </header>

      <div className="signin-grid">
        <section className="signin-intro">
          <h1>Find work <em>worthy</em> of your experience.</h1>

          <div className="signin-stages" aria-label="How Sartho works">
            {stages.map((stage, index) => (
              <Fragment key={stage}>
                {index > 0 ? <i style={{ ["--i" as string]: index - 1 }} aria-hidden="true" /> : null}
                <span style={{ ["--i" as string]: index }}>{stage}</span>
              </Fragment>
            ))}
          </div>
        </section>

        <section className="signin-card">
          <h2>Welcome to Sartho</h2>

          <button type="button" className="signin-google" onClick={signInWithGoogle} disabled={busy}>
            <GoogleIcon />
            <span>{busy ? "Connecting…" : "Continue with Google"}</span>
          </button>

          {message ? <p className="signin-error" role="alert">{message}</p> : null}

          <p className="signin-note">Private beta — approved accounts only.</p>
        </section>
      </div>

      <footer className="signin-foot">
        <i aria-hidden="true" />
        <span>Nothing is submitted without your approval.</span>
      </footer>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.94A6.02 6.02 0 0 1 6.1 12c0-.67.12-1.33.31-1.94V7.44H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.56l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.44l3.35 2.62C7.2 7.7 9.4 5.94 12 5.94Z" />
    </svg>
  );
}
