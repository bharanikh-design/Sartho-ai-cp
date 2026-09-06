"use client";

import { useState } from "react";
import type { DigestHealth } from "@/lib/notifications/digest-health";

/*
 * The daily summary, and — new — whether it is actually being sent.
 *
 * This card used to offer an address, a toggle and nothing else. A scheduled
 * email is the one feature that gives no sign when it breaks: no error, no
 * email, and an email that does not arrive looks exactly like a quiet day. So
 * the only way to find out that the cron had been failing was to notice an
 * absence, which nobody does.
 *
 * Two things fix that, and match alerts have had both since they shipped: the
 * last send is stated, and delivery can be proved on demand rather than by
 * waiting until midnight.
 */
export function DailyDigestSettings({
  initialEmail,
  initialEnabled,
  deliveryReady,
  health,
}: {
  initialEmail: string;
  initialEnabled: boolean;
  deliveryReady: boolean;
  /**
   * Whether the schedule is actually running, decided on the server.
   *
   * It compares a stored timestamp against "now", and the server's now and the
   * browser's now are different numbers — computing it here would render text
   * that changes on hydration, and near a boundary the two could genuinely
   * disagree about whether the schedule is healthy.
   */
  health: DigestHealth;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, enabled }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save notifications.");
      setStatus("saved");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Unable to save notifications.");
    }
  }

  async function sendTest() {
    setTestStatus("sending");
    setTestMessage(null);
    try {
      const response = await fetch("/api/notifications/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; newMatches?: number; strongMatches?: number };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not send the test.");
      setTestStatus("sent");
      /*
       * The counts matter. A digest covering a quiet day is nearly empty, and
       * without saying so the arriving email looks like a broken one.
       */
      setTestMessage(
        `Sent to ${email}. It covers the last 24 hours: ${result.newMatches ?? 0} new opportunities, ${result.strongMatches ?? 0} strong matches. Check your spam folder if it does not appear.`,
      );
    } catch (caught) {
      setTestStatus("error");
      setTestMessage(caught instanceof Error ? caught.message : "Sartho could not send the test.");
    }
  }

  return (
    <section className="dashboard-digest" aria-labelledby="daily-digest-title">
      <div>
        <p className="product-system-eyebrow">Daily summary · Every 24 hours</p>
        <h2 id="daily-digest-title">Get one useful update, not constant alerts.</h2>
        <p>Receive new saved opportunities, strong matches, active applications and recorded outcomes at the address you choose.</p>
        {!deliveryReady ? (
          <span className="digest-setup-note">
            Delivery is paused until the email provider is connected. Add <code>RESEND_API_KEY</code> and <code>SARTHO_EMAIL_FROM</code> in the deployment settings; your preference below is saved either way.
          </span>
        ) : null}
        {/*
          * A separate class from the setup note above, which is styled as a
          * warning. Most of what this says is good news, and rendering "the
          * schedule is running" in amber would teach people to ignore the one
          * time it says something is wrong.
          */}
        <span className={`digest-status-note${health.concerning ? " is-concerning" : ""}`} role={health.concerning ? "status" : undefined}>
          {health.message}
        </span>
      </div>
      <div className="digest-controls">
        <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label className="digest-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Send my daily summary</span></label>
        <div className="digest-actions">
          <button type="button" className="secondary-button" onClick={() => void save()} disabled={status === "saving" || !email.trim()}>
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save notifications"}
          </button>
          {/*
            * Available whether or not the digest is switched on: this is how a
            * person finds out whether email delivery works at all, and being
            * made to opt in first would put the diagnosis behind the thing
            * being diagnosed.
            */}
          <button type="button" className="secondary-button" onClick={() => void sendTest()} disabled={testStatus === "sending" || !email.trim() || !deliveryReady}>
            {testStatus === "sending" ? "Sending…" : "Send one to me now"}
          </button>
        </div>
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        {testMessage ? (
          <div className={testStatus === "error" ? "inline-error" : "search-field-hint"} role={testStatus === "error" ? "alert" : "status"}>
            {testMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
