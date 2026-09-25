"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const ANALYTICS_CONSENT_KEY = "sartho:analytics-consent:v1";
export const ANALYTICS_CONSENT_EVENT = "sartho:analytics-consent-changed";
export const OPEN_PRIVACY_PREFERENCES_EVENT = "sartho:open-privacy-preferences";
export const VISITOR_KEY = "sartho:visitor-id";

export type AnalyticsConsent = "granted" | "declined";

export function readAnalyticsConsent(): AnalyticsConsent | null {
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

async function revokeAnonymousTelemetry() {
  let visitorId: string | null = null;
  try {
    visitorId = window.localStorage.getItem(VISITOR_KEY);
    if (visitorId) {
      await fetch("/api/activity/audience", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId }),
        keepalive: true,
      });
    }
  } catch {
    // Server cleanup is best effort; local tracking still stops below.
  } finally {
    try {
      window.localStorage.removeItem(VISITOR_KEY);
    } catch {
      // Browser storage can be unavailable in hardened/private contexts.
    }
  }
}

export function PrivacyPreferences() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(readAnalyticsConsent() === null);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_PRIVACY_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_PRIVACY_PREFERENCES_EVENT, reopen);
  }, []);

  async function choose(value: AnalyticsConsent) {
    if (value === "declined") await revokeAnonymousTelemetry();

    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    } catch {
      // If storage is unavailable, analytics stays off because no grant can persist.
    }

    window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: value }));
    setOpen(false);
  }

  if (!open) return null;

  return (
    <aside className="privacy-preferences" role="dialog" aria-modal="false" aria-labelledby="privacy-preferences-title">
      <div>
        <strong id="privacy-preferences-title">Privacy choices</strong>
        <p>
          Sartho uses necessary browser storage for sign-in, security and your settings.
          Optional analytics helps WonderfulMinds understand visits and improve the product.
          We do not use advertising trackers. <Link href="/privacy">Privacy policy</Link>
        </p>
      </div>
      <div className="privacy-preferences-actions">
        <button type="button" className="secondary-button" onClick={() => void choose("declined")}>
          Necessary only
        </button>
        <button type="button" className="primary-button" onClick={() => void choose("granted")}>
          Allow analytics
        </button>
      </div>
    </aside>
  );
}
