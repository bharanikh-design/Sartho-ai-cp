"use client";

import { useEffect } from "react";
import { HEARTBEAT_SECONDS } from "@/lib/analytics/activity";

/*
 * Reports that somebody is here, while they are actually here.
 *
 * Only while the tab is visible, which is the one rule that keeps the number
 * honest: a tab left open on a second monitor, or a laptop closed for the
 * night, sends nothing, so the server never sees a gap it would have to guess
 * about. It carries no payload — the server decides what a beat is worth by
 * comparing against what it already holds, so a page cannot assert a duration.
 *
 * It renders nothing and it never reports a failure. Nothing a person is doing
 * depends on this, and an error about analytics would be an interruption in
 * service of nobody.
 */
export function ActivityHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    const beat = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      /* keepalive so a beat in flight survives the tab being closed. */
      void fetch("/api/activity", { method: "POST", keepalive: true }).catch(() => {});
    };

    /*
     * One beat immediately, so a visit of under a minute still registers as a
     * visit — the shortest sessions are the ones worth knowing about.
     */
    beat();
    const timer = setInterval(beat, HEARTBEAT_SECONDS * 1000);

    /*
     * Coming back to the tab beats straight away rather than waiting out the
     * remainder of the interval. Without this, a person who returns for forty
     * seconds is never seen at all.
     */
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
