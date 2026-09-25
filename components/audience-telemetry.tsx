"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ANALYTICS_CONSENT_EVENT,
  readAnalyticsConsent,
  VISITOR_KEY,
  type AnalyticsConsent,
} from "@/components/privacy-preferences";

function visitorId(): string | null {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function referrerHost(): string | null {
  try {
    if (!document.referrer) return null;
    return new URL(document.referrer).host || null;
  } catch {
    return null;
  }
}

/**
 * Minimal acquisition telemetry.
 *
 * One random browser id, current path and the original referrer host. No IP,
 * full referrer URL, user-agent fingerprint or page-level history is stored.
 * When the same browser later authenticates, the server marks this anonymous
 * visitor as converted to that account.
 */
export function AudienceTelemetry() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);

  useEffect(() => {
    setConsent(readAnalyticsConsent());

    const changed = (event: Event) => {
      const value = (event as CustomEvent<AnalyticsConsent>).detail;
      setConsent(value === "granted" || value === "declined" ? value : readAnalyticsConsent());
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, changed);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, changed);
  }, []);

  useEffect(() => {
    if (consent !== "granted") return;

    const id = visitorId();
    if (!id) return;

    void fetch("/api/activity/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId: id,
        path: pathname || "/",
        referrerHost: referrerHost(),
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [consent, pathname]);

  return null;
}
