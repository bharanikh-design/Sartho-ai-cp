"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const VISITOR_KEY = "sartho:visitor-id";

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

  useEffect(() => {
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
  }, [pathname]);

  return null;
}
