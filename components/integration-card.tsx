"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/*
 * One connected service, and the button that takes it away.
 *
 * Disconnect is the reason this page exists. Sartho's whole argument is that
 * it does not act behind your back, and the way you prove that is not with a
 * paragraph about privacy — it is with a button that revokes the grant at
 * Google's end, in one click, without a confirmation maze.
 */
export function IntegrationCard({
  name,
  purpose,
  connected,
  accountEmail,
  connectedAt,
  driveGranted,
  configured,
}: {
  name: string;
  purpose: string;
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  driveGranted: boolean;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/google/disconnect", { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sartho could not disconnect that account.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sartho could not disconnect that account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="integration-card glass-card">
      <div className="integration-card__head">
        <div>
          <strong>{name}</strong>
          <p>{purpose}</p>
        </div>
        <span className={`integration-state${connected ? " is-on" : ""}`}>
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {connected ? (
        <p className="integration-card__detail">
          {accountEmail ? <>Reading as <strong>{accountEmail}</strong>. </> : null}
          {connectedAt ? <>Connected {new Date(connectedAt).toLocaleDateString("en-GB")}. </> : null}
          Read-only — Sartho cannot create, change or delete anything in your Drive.
        </p>
      ) : null}

      {/*
        * A grant that completed without the Drive scope is the one failure
        * worth shouting about: everything looks connected, and the résumé
        * search returns a 403 nobody can interpret.
        */}
      {connected && !driveGranted ? (
        <p className="integration-card__warn" role="status">
          Drive access was not granted, so Sartho cannot look for your résumé. Disconnect and connect again, leaving
          the Drive permission ticked.
        </p>
      ) : null}

      <div className="integration-card__actions">
        {connected ? (
          <button type="button" className="secondary-button" onClick={() => void disconnect()} disabled={busy}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : configured ? (
          <a className="primary-button" href="/api/integrations/google/connect">
            Connect<span aria-hidden="true"> →</span>
          </a>
        ) : (
          <p className="integration-card__detail">
            Not available on this deployment yet — <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>{" "}
            are not set.
          </p>
        )}
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}
    </section>
  );
}
