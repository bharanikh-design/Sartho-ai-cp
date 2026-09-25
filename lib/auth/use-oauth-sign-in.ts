"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_ORIGIN, isAllowedAuthOrigin, resolveAuthOrigin } from "@/lib/site";

/*
 * The one place a Sartho sign-in is started.
 *
 * The front door and /login are two different screens that must not become two
 * different OAuth flows. A second copy — with its own origin handoff and its own
 * idea of where to return to — is exactly the duplication that took this page
 * through three rewrites, so the mechanics live here once and both screens read
 * them through this hook. Only the presentation differs.
 *
 * Supabase names the LinkedIn provider "linkedin_oidc"; the bare "linkedin" id
 * is the retired OAuth 2.0 one and is rejected.
 */
export const PROVIDERS = ["google", "github", "apple"] as const;
export type Provider = (typeof PROVIDERS)[number];

export function friendlyAuthMessage(message: string): string {
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
   * is for the copy that never goes through the callback — a failure the browser
   * client raises on its own.
   */
  if (value.includes("code verifier") || value.includes("code_verifier")) {
    const canonical = AUTH_ORIGIN.replace(/^https?:\/\//, "");
    return `This sign-in started on a different address than it finished on, so the browser could not prove the round trip was yours. Start again from ${canonical} and it will complete.`;
  }

  return message;
}

export type OAuthSignIn = {
  /** The provider whose round trip is in flight, or null when idle. */
  busy: string | null;
  /** A human-readable failure, or null. */
  error: string | null;
  /** Begin an OAuth round trip for the given provider. */
  signInWithProvider: (provider: Provider) => Promise<void>;
};

/**
 * Owns the Supabase OAuth round trip and its two hazards: an already-signed-in
 * visitor landing here, and a sign-in that has to hand off to the canonical
 * origin before PKCE can complete. The behaviour is identical to what the
 * sign-in screen ran before this hook existed — it has only moved.
 */
export function useOAuthSignIn(): OAuthSignIn {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  /*
   * Both legs of a sign-in have to run on one origin.
   *
   * The redirect target used to be pinned to AUTH_ORIGIN no matter where the
   * button was pressed. Press it on www.sartho.tech, or on the vercel.app
   * deployment, and the PKCE code verifier is written into a cookie for that
   * host while Google returns to the apex, which never receives it — the
   * callback then fails with "PKCE code verifier not found in storage" and the
   * user is bounced back here with no way to get past it. Sending the browser to
   * the canonical origin *before* the round trip starts is the fix; sending it
   * there afterwards is the bug.
   */
  async function signInWithProvider(provider: Provider) {
    setBusy(provider);
    setError(null);

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

  return { busy, error, signInWithProvider };
}
