"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

/*
 * Sign-in — the product's front door.
 *
 * Shares the workspace's dark canvas and design tokens so the app reads as one
 * product. The restraint is in the type scale and the word count, not in the
 * colour: a balanced headline (not 88px), copy that stays legible (nothing
 * below 12px), and a two-column composition that uses the full canvas on
 * desktop instead of stranding a mobile-sized card in the middle.
 *
 * Styles are inlined so this page can be deployed as a single file.
 */
const styles = `
.signin {
  position: relative;
  width: min(100%, 1280px);
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: clamp(24px, 4vw, 48px);
  padding: clamp(22px, 4vw, 56px);
  color: var(--text, #f7f8fb);
}

/* Masthead */
.signin-top { display: flex; align-items: center; gap: 12px; }
.signin-mark {
  width: 38px; height: 38px; display: grid; place-items: center;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(150deg, #5b7fe4, #8f7ae6);
  box-shadow: 0 8px 22px rgba(84,112,214,.28);
  font-size: 17px; font-weight: 650; letter-spacing: -0.02em;
}
.signin-top strong { display: block; font-size: 16px; font-weight: 650; letter-spacing: -0.02em; }
.signin-top small { display: block; margin-top: 2px; font-size: 12px; color: var(--text-tertiary, rgba(239,242,249,.44)); }

/* Two-column stage */
.signin-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, .82fr);
  gap: clamp(36px, 6vw, 88px);
  align-items: center;
}

.signin-intro h1 {
  margin: 0;
  max-width: 15ch;
  font-size: clamp(34px, 4.6vw, 56px);
  line-height: 1.04;
  letter-spacing: -0.035em;
  font-weight: 640;
  text-wrap: balance;
}
.signin-intro p {
  max-width: 46ch;
  margin: 20px 0 0;
  color: var(--text-secondary, rgba(239,242,249,.68));
  font-size: clamp(15px, 1.3vw, 17px);
  line-height: 1.6;
  letter-spacing: -0.005em;
}

/* Journey strip — the five stages, stated without paragraphs */
.signin-stages {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin-top: clamp(26px, 3vw, 36px);
}
.signin-stages span {
  display: inline-flex; align-items: center; min-height: 32px;
  padding: 0 13px;
  border: 1px solid var(--line, rgba(255,255,255,.095));
  border-radius: 999px;
  background: rgba(255,255,255,.03);
  color: var(--text-tertiary, rgba(239,242,249,.44));
  font-size: 12px; font-weight: 600;
}
.signin-stages span:first-child {
  border-color: rgba(143,176,255,.28);
  background: rgba(112,148,255,.12);
  color: #dbe6ff;
}
.signin-stages i { width: 14px; height: 1px; background: var(--line, rgba(255,255,255,.12)); }

/* Card */
.signin-card {
  justify-self: end;
  width: 100%;
  max-width: 430px;
  padding: clamp(26px, 3vw, 36px);
  border: 1px solid var(--line, rgba(255,255,255,.095));
  border-radius: 24px;
  background: var(--glass-strong, rgba(16,20,29,.82));
  box-shadow: 0 24px 70px rgba(0,0,0,.34);
  backdrop-filter: blur(18px);
}
.signin-card h2 {
  margin: 0;
  font-size: 24px; line-height: 1.15;
  letter-spacing: -0.028em; font-weight: 640;
}
.signin-sub {
  margin: 9px 0 0;
  color: var(--text-secondary, rgba(239,242,249,.68));
  font-size: 14px; line-height: 1.55;
}

.signin-google {
  width: 100%; min-height: 52px;
  display: flex; align-items: center; justify-content: center; gap: 11px;
  margin-top: 24px;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: 14px;
  color: #f8f9fc;
  background: rgba(255,255,255,.06);
  cursor: pointer; font: inherit;
  font-size: 15px; font-weight: 600;
  transition: background .2s ease, border-color .2s ease, transform .2s ease;
}
.signin-google:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,.22);
  background: rgba(255,255,255,.1);
}
.signin-google:disabled { opacity: .6; cursor: progress; }
.signin-google svg { flex: none; }

.signin-note {
  margin: 16px 0 0;
  color: var(--text-tertiary, rgba(239,242,249,.44));
  font-size: 12px; line-height: 1.5; text-align: center;
}
.signin-fine {
  margin: 20px 0 0; padding-top: 18px;
  border-top: 1px solid rgba(255,255,255,.07);
  color: var(--text-tertiary, rgba(239,242,249,.44));
  font-size: 12px; line-height: 1.6;
}
.signin-error {
  margin: 20px 0 0; padding: 12px 14px;
  border: 1px solid rgba(255,142,163,.24);
  border-radius: 12px;
  color: #ffc2ce; background: rgba(255,142,163,.08);
  font-size: 13px; line-height: 1.55;
}

.signin-foot {
  display: flex; align-items: center; gap: 8px;
  color: var(--text-tertiary, rgba(239,242,249,.44));
  font-size: 12px;
}
.signin-foot i {
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--mint, #72e6bd);
  box-shadow: 0 0 10px rgba(114,230,189,.6);
}

.signin :is(button, a):focus-visible { outline: 2px solid rgba(143,183,255,.92); outline-offset: 3px; }

@media (max-width: 940px) {
  .signin-grid { grid-template-columns: 1fr; gap: 32px; align-items: start; }
  .signin-card { justify-self: stretch; max-width: none; }
  .signin-intro h1 { max-width: none; font-size: clamp(32px, 7vw, 46px); }
}
@media (max-width: 560px) {
  .signin { gap: 22px; }
  .signin-stages { gap: 6px; }
  .signin-stages i { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .signin-google { transition: none; }
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
        <span className="signin-mark" aria-hidden="true">S</span>
        <span>
          <strong>Sartho</strong>
          <small>AI Career Copilot</small>
        </span>
      </header>

      <div className="signin-grid">
        <section className="signin-intro">
          <h1>Your career, intelligently guided.</h1>
          <p>Find roles worthy of your experience, prove the fit with real evidence, and walk in prepared.</p>

          <div className="signin-stages" aria-label="How Sartho works">
            {stages.map((stage, index) => (
              <Fragment key={stage}>
                {index > 0 ? <i aria-hidden="true" /> : null}
                <span>{stage}</span>
              </Fragment>
            ))}
          </div>
        </section>

        <section className="signin-card">
          <h2>Welcome to Sartho</h2>
          <p className="signin-sub">Continue with your Google account. No new password to remember.</p>

          <button type="button" className="signin-google" onClick={signInWithGoogle} disabled={busy}>
            <GoogleIcon />
            <span>{busy ? "Connecting…" : "Continue with Google"}</span>
          </button>

          {message ? <p className="signin-error" role="alert">{message}</p> : null}

          <p className="signin-note">Private beta — approved accounts only.</p>

          <p className="signin-fine">
            Signing in only verifies who you are. Sartho never submits an application without your approval.
          </p>
        </section>
      </div>

      <footer className="signin-foot">
        <i aria-hidden="true" />
        <span>Private and evidence-led — your data stays yours.</span>
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
