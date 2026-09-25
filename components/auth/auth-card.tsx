"use client";

import { forwardRef } from "react";
import { AnimatedBorder } from "@/components/landing/animated-border";
import { PROVIDER_META } from "@/components/auth/provider-icons";
import { PROVIDERS, type Provider } from "@/lib/auth/use-oauth-sign-in";

/*
 * The sign-in card — a floating pane of glass, and the one thing everyone came
 * for.
 *
 * Purely presentational: it owns no auth logic. The front door and /login both
 * drive it from the same useOAuthSignIn hook and differ only in what sits around
 * it. Keeping the mechanics out of here is what lets the two screens share one
 * flow instead of drifting into two.
 *
 * The three providers are icon tiles in a row, as the design shows: the brand
 * marks are recognised on sight, and a tile is a larger, calmer target than a
 * full-width button stack. Each still carries its accessible name.
 */
export type AuthCardProps = {
  busy: string | null;
  error: string | null;
  onProvider: (provider: Provider) => void;
  /** Anchor target so "Get Started" can bring the card into view. */
  id?: string;
};

export const AuthCard = forwardRef<HTMLDivElement, AuthCardProps>(function AuthCard(
  { busy, error, onProvider, id },
  ref,
) {
  return (
    <AnimatedBorder className="fd-card" radius={26} duration={9}>
      <div className="fd-card-inner" id={id} ref={ref}>
        <h2 className="fd-card-title">Welcome to Sartho</h2>
        <p className="fd-card-sub">Sign in securely with your preferred account.</p>

        <div className="fd-providers" role="group" aria-label="Sign in options">
          {PROVIDERS.map((provider: Provider) => {
            const { label, Icon } = PROVIDER_META[provider];
            const pending = busy === provider;
            return (
              <button
                key={provider}
                type="button"
                className="fd-provider"
                aria-label={`Continue with ${label}`}
                aria-busy={pending}
                title={label}
                onClick={() => onProvider(provider)}
                disabled={busy !== null}
              >
                <Icon />
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="fd-card-msg" role="alert">
            {error}
          </p>
        ) : null}

        <p className="fd-card-note">Private beta · approved accounts only</p>
      </div>
    </AnimatedBorder>
  );
});
