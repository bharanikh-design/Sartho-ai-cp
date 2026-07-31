"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

/*
 * Sign-in — the product's front door.
 *
 * Deliberately light and quiet: the workspace behind it is dark and dense, so
 * this page stays calm, uncluttered and legible. Styles are inlined here to
 * keep the page self-contained. Nothing glows, and no text is below 12px.
 */
const styles = `
.signin {
  color-scheme: light;
  position: relative;
  z-index: 1;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 24px;
  padding: clamp(20px, 4vw, 40px);
  color: #1d1d1f;
  background: #f5f5f7;
  font-family: "Segoe UI Variable Display", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.signin-bar { display: flex; align-items: center; gap: 10px; }
.signin-mark {
  width: 30px; height: 30px; display: grid; place-items: center;
  border-radius: 9px; color: #fff; background: #1d1d1f;
  font-size: 15px; font-weight: 600; letter-spacing: -0.02em;
}
.signin-wordmark { font-size: 17px; font-weight: 600; letter-spacing: -0.022em; }
.signin-stage { display: grid; place-items: center; padding: clamp(12px, 4vw, 32px) 0; }
.signin-panel { width: min(100%, 400px); text-align: center; }
.signin-panel h1 {
  margin: 0;
  font-size: clamp(27px, 3.1vw, 34px);
  line-height: 1.14;
  letter-spacing: -0.021em;
  font-weight: 600;
  text-wrap: balance;
}
.signin-lede {
  margin: 10px 0 0; color: #6e6e73;
  font-size: 16px; line-height: 1.5; letter-spacing: -0.01em;
}
.signin-card {
  margin-top: clamp(22px, 3vw, 28px);
  padding: clamp(22px, 4vw, 30px);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 8px 28px rgba(0,0,0,.06);
}
.signin-google {
  width: 100%; min-height: 52px;
  display: flex; align-items: center; justify-content: center; gap: 12px;
  border: 0; border-radius: 12px;
  color: #fff; background: #131314;
  cursor: pointer; font: inherit;
  font-size: 16px; font-weight: 500; letter-spacing: -0.01em;
  transition: background .2s ease, transform .2s ease;
}
.signin-google:hover:not(:disabled) { background: #2a2a2c; }
.signin-google:active:not(:disabled) { transform: scale(.99); }
.signin-google:disabled { opacity: .55; cursor: progress; }
.signin-google svg { flex: none; }
.signin-note { margin: 16px 0 0; color: #6e6e73; font-size: 13px; line-height: 1.5; }
.signin-error {
  margin: 0 0 16px; padding: 12px 14px; border-radius: 12px;
  color: #8c1d18; background: #fdeceb;
  font-size: 13px; line-height: 1.55; text-align: left;
}
.signin-foot { display: flex; justify-content: center; color: #6e6e73; font-size: 12px; }
.signin :is(button, a):focus-visible { outline: 2px solid #0071e3; outline-offset: 3px; }
@media (max-width: 480px) {
  .signin-card { padding: 20px; }
  .signin-lede { font-size: 15px; }
}
@media (prefers-reduced-motion: reduce) { .signin-google { transition: none; } }
`;

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

      <header className="signin-bar">
        <span className="signin-mark" aria-hidden="true">S</span>
        <span className="signin-wordmark">Sartho</span>
      </header>

      <div className="signin-stage">
        <section className="signin-panel">
          <h1>Your career, intelligently guided.</h1>
          <p className="signin-lede">Sign in to continue.</p>

          <div className="signin-card">
            {message ? <p className="signin-error" role="alert">{message}</p> : null}

            <button type="button" className="signin-google" onClick={signInWithGoogle} disabled={busy}>
              <GoogleIcon />
              <span>{busy ? "Connecting…" : "Continue with Google"}</span>
            </button>

            <p className="signin-note">Private beta — approved accounts only.</p>
          </div>
        </section>
      </div>

      <footer className="signin-foot">Nothing is submitted without your approval.</footer>
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
