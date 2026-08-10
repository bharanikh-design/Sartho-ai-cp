"use client";

import { useState } from "react";

export function DailyDigestSettings({
  initialEmail,
  initialEnabled,
  deliveryReady,
}: {
  initialEmail: string;
  initialEnabled: boolean;
  deliveryReady: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="dashboard-digest" aria-labelledby="daily-digest-title">
      <div>
        <p className="product-system-eyebrow">Daily summary · Every 24 hours</p>
        <h2 id="daily-digest-title">Get one useful update, not constant alerts.</h2>
        <p>Receive new saved opportunities, strong matches, active applications and recorded outcomes at the address you choose.</p>
        {!deliveryReady ? <span className="digest-setup-note">Delivery is paused until the application email provider is connected.</span> : null}
      </div>
      <div className="digest-controls">
        <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label className="digest-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Send my daily summary</span></label>
        <button type="button" className="secondary-button" onClick={() => void save()} disabled={status === "saving" || !email.trim()}>{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save notifications"}</button>
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
      </div>
    </section>
  );
}
