"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

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
    <main className="auth-page">
      <div className="auth-ambient auth-ambient-one" aria-hidden="true" />
      <div className="auth-ambient auth-ambient-two" aria-hidden="true" />

      <section className="auth-story" aria-label="About Sartho">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><span>S</span></span>
          <div><strong>Sartho AI</strong><small>Your career, intelligently guided.</small></div>
        </div>

        <div className="auth-story-copy">
          <span className="page-eyebrow"><span className="live-dot" /> Your next chapter starts here</span>
          <h1>One right role<br />can change everything.</h1>
          <p>
            Sartho helps you find work worthy of your experience, prove why you belong, prepare with confidence,
            and be ready to land the opportunity when it appears.
          </p>
          <div className="auth-promise">
            <strong>Find it. Align for it. Stand out. Prepare. Land it.</strong>
            <span>Evidence-backed career intelligence, always under your control.</span>
          </div>
        </div>

        <div className="auth-route-preview" aria-label="Your Sartho journey">
          <span className="route-node is-active">Discover</span><i />
          <span className="route-node">Align</span><i />
          <span className="route-node">Stand out</span><i />
          <span className="route-node">Prepare</span><i />
          <span className="route-node">Land it</span>
        </div>
      </section>

      <section className="auth-card glass-strong">
        <div className="auth-card-heading">
          <span className="auth-kicker">Your secure career workspace</span>
          <h2>Welcome to Sartho</h2>
          <p>Use your Google account. No new password and no separate account-registration form.</p>
        </div>

        <button type="button" className="oauth-button" onClick={signInWithGoogle} disabled={busy}>
          <GoogleIcon />
          <span>{busy ? "Connecting to Google…" : "Continue with Google"}</span>
        </button>

        {message ? <div className="auth-message error" role="alert">{message}</div> : null}

        <p className="auth-access-note">
          During private beta, access is limited to approved Google accounts.
        </p>

        <p className="auth-footnote">
          Signing in only verifies who you are. Sartho will not read Gmail or submit an application unless you separately approve that connection and action.
        </p>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.94A6.02 6.02 0 0 1 6.1 12c0-.67.12-1.33.31-1.94V7.44H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.56l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.44l3.35 2.62C7.2 7.7 9.4 5.94 12 5.94Z" />
    </svg>
  );
}
