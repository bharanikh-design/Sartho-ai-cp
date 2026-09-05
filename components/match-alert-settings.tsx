"use client";

import { useState } from "react";

/*
 * Match alerts — opt in to an email of new strong matches from a scheduled run
 * of the saved brief. The "Send a test now" button runs the whole chain (brief
 * → providers → scoring → email) immediately, so the person can see it working
 * instead of trusting that something will arrive overnight.
 */

export function MatchAlertSettings({
  initialEmail,
  initialEnabled,
  deliveryReady,
  lastRunAt,
}: {
  initialEmail: string;
  initialEnabled: boolean;
  deliveryReady: boolean;
  lastRunAt: string | null;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setStatus("saving");
    setMessage(null);
    try {
      const response = await fetch("/api/notifications/match-alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, enabled }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save alerts.");
      setStatus("saved");
    } catch (caught) {
      setStatus("error");
      setMessage(caught instanceof Error ? caught.message : "Unable to save alerts.");
    }
  }

  async function sendTest() {
    setTestStatus("sending");
    setMessage(null);
    try {
      const response = await fetch("/api/notifications/match-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; matches?: number };
      if (!response.ok) throw new Error(result.error ?? "Could not send a test.");
      setTestStatus("sent");
      setMessage(`Sent to ${email} with ${result.matches ?? 0} match${result.matches === 1 ? "" : "es"}. Check spam if it isn't there in a minute.`);
    } catch (caught) {
      setTestStatus("error");
      setMessage(caught instanceof Error ? caught.message : "Could not send a test.");
    }
  }

  const lastRun = lastRunAt ? new Date(lastRunAt) : null;

  return (
    <section className="glass-card content-card" id="match-alerts" aria-labelledby="match-alerts-title">
      <div className="card-header">
        <div>
          <h2 className="section-heading" id="match-alerts-title">Email me new matches</h2>
          <p className="section-subtitle">Once a day Sartho runs this brief and emails only the strong matches you haven&apos;t been shown before. Quiet day, no email.</p>
        </div>
      </div>
      {!deliveryReady ? (
        <div className="empty-inline-state">
          Email delivery isn&apos;t connected yet. Add <code>RESEND_API_KEY</code> and <code>SARTHO_EMAIL_FROM</code> in the deployment settings; your preference below is saved either way.
        </div>
      ) : null}
      <div className="digest-controls" style={{ marginTop: "12px" }}>
        <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label className="digest-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Send me new matches daily</span></label>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving" || !email.trim()}>
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save alerts"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void sendTest()} disabled={!deliveryReady || testStatus === "sending" || !email.trim()}>
            {testStatus === "sending" ? "Searching and sending…" : "Send me a test now"}
          </button>
        </div>
        {lastRun ? <span className="search-field-hint">Last scheduled run: {lastRun.toLocaleString()}</span> : null}
        {message ? (
          <div className={testStatus === "error" || status === "error" ? "inline-error" : "search-field-hint"} role={testStatus === "error" || status === "error" ? "alert" : undefined}>{message}</div>
        ) : null}
      </div>
    </section>
  );
}
