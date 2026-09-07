"use client";

import { useState } from "react";

/*
 * Every email Sartho sends, as two switches.
 *
 * This replaced two full-width cards — each with its own heading, paragraph,
 * address field, checkbox, Save button and test button — that between them
 * filled two screens to express four facts: an address, and two yes/nos. The
 * address is the same column for both, so it was being asked for twice, and
 * a checkbox that only takes effect after a separate Save is the reason people
 * conclude a preference did not stick.
 *
 * So: one address, two switches, and the switch itself is the save. What is
 * left is a line of state per row — when it last went out — because a
 * scheduled email is the one feature that gives no sign when it breaks, and an
 * email that does not arrive is indistinguishable from a quiet day.
 */

type Row = {
  key: "matches" | "digest";
  label: string;
  detail: string;
  endpoint: string;
  enabled: boolean;
  /** One line of evidence that the schedule is running, or null when there is none. */
  status: string | null;
  concerning: boolean;
};

export function EmailSettings({
  initialEmail,
  matchAlertsEnabled,
  digestEnabled,
  deliveryReady,
  matchAlertsStatus,
  matchAlertsConcerning,
  digestStatus,
  digestConcerning,
}: {
  initialEmail: string;
  matchAlertsEnabled: boolean;
  digestEnabled: boolean;
  deliveryReady: boolean;
  /** Decided on the server: it compares stored timestamps against "now". */
  matchAlertsStatus: string | null;
  matchAlertsConcerning: boolean;
  digestStatus: string;
  digestConcerning: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [matches, setMatches] = useState(matchAlertsEnabled);
  const [digest, setDigest] = useState(digestEnabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const addressed = email.trim().length > 0 && email.includes("@");

  const rows: Row[] = [
    {
      key: "matches",
      label: "New matches",
      detail: "Strong matches from your brief that you haven't been shown before. Quiet day, no email.",
      endpoint: "/api/notifications/match-alerts",
      enabled: matches,
      status: matchAlertsStatus,
      concerning: matchAlertsConcerning,
    },
    {
      key: "digest",
      label: "Daily summary",
      detail: "Saved opportunities, active applications and recorded outcomes, once every 24 hours.",
      endpoint: "/api/notifications/preferences",
      enabled: digest,
      status: digestStatus,
      concerning: digestConcerning,
    },
  ];

  /*
   * Both endpoints write the same `email` column, so an address change has to
   * reach both or the row's two switches disagree about what they were saved
   * with. Writing both on every change costs one extra request and removes the
   * whole class of drift.
   */
  async function persist(next: { email: string; matches: boolean; digest: boolean }) {
    const writes: Array<[string, boolean]> = [
      ["/api/notifications/match-alerts", next.matches],
      ["/api/notifications/preferences", next.digest],
    ];
    for (const [endpoint, enabled] of writes) {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: next.email, enabled }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "Sartho could not save that.");
      }
    }
  }

  async function toggle(key: Row["key"], value: boolean) {
    /* Flip first: a switch that waits for the network feels broken. */
    if (key === "matches") setMatches(value);
    else setDigest(value);
    setBusy(key);
    setNote(null);
    const next = { email: email.trim(), matches: key === "matches" ? value : matches, digest: key === "digest" ? value : digest };
    try {
      await persist(next);
      setNote({ text: value ? "On — saved." : "Off — saved.", bad: false });
    } catch (caught) {
      if (key === "matches") setMatches(!value);
      else setDigest(!value);
      setNote({ text: caught instanceof Error ? caught.message : "Sartho could not save that.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function saveAddress() {
    const trimmed = email.trim();
    if (!addressed || trimmed === initialEmail) return;
    setBusy("email");
    setNote(null);
    try {
      await persist({ email: trimmed, matches, digest });
      setNote({ text: `Saved. Both emails go to ${trimmed}.`, bad: false });
    } catch (caught) {
      setNote({ text: caught instanceof Error ? caught.message : "Sartho could not save that.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(row: Row) {
    setBusy(`test-${row.key}`);
    setNote(null);
    try {
      const endpoint = row.key === "matches" ? "/api/notifications/match-alerts" : "/api/notifications/digest";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Sartho could not send that.");
      setNote({ text: `Sent to ${email.trim()}. Check spam if it isn't there in a minute.`, bad: false });
    } catch (caught) {
      setNote({ text: caught instanceof Error ? caught.message : "Sartho could not send that.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="email-settings glass-card" aria-label="Email settings">
      <div className="email-settings__address">
        <label htmlFor="notification-email">Send to</label>
        <input
          id="notification-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => void saveAddress()}
          placeholder="you@example.com"
        />
      </div>

      {!deliveryReady ? (
        <p className="email-settings__warn" role="status">
          Email delivery isn&apos;t connected. Your choices below still save.
        </p>
      ) : null}

      <ul className="email-settings__rows">
        {rows.map((row) => (
          <li className="email-settings__row" key={row.key}>
            <div className="email-settings__copy">
              <strong>{row.label}</strong>
              <span>{row.detail}</span>
              {row.status ? (
                <span className={`email-settings__state${row.concerning ? " is-concerning" : ""}`}>{row.status}</span>
              ) : null}
            </div>
            <div className="email-settings__controls">
              <button
                type="button"
                role="switch"
                aria-checked={row.enabled}
                aria-label={row.label}
                className={`email-switch${row.enabled ? " is-on" : ""}`}
                onClick={() => void toggle(row.key, !row.enabled)}
                disabled={busy !== null || !addressed}
              >
                <span aria-hidden="true" />
              </button>
              {/*
                * Kept, and kept small. It is the only way to find out whether
                * delivery works at all without waiting until midnight — and it
                * stays available while the switch is off, because putting the
                * diagnosis behind the thing being diagnosed is useless.
                */}
              <button
                type="button"
                className="email-settings__test"
                onClick={() => void sendTest(row)}
                disabled={busy !== null || !addressed || !deliveryReady}
              >
                {busy === `test-${row.key}` ? "Sending…" : "Test"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {note ? (
        <p className={`email-settings__note${note.bad ? " is-bad" : ""}`} role={note.bad ? "alert" : "status"}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
