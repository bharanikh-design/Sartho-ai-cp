"use client";

import { useState } from "react";
import type { AddressSummary } from "@/lib/notifications/address-response";

/*
 * Every email Sartho sends, as one address and two switches.
 *
 * The address is the part that has to be careful. It used to be saved as
 * typed and used as typed, which let anybody point a daily email at a
 * stranger's inbox. Now it is one of two things: the account's own sign-in
 * address, which needs no confirmation because the identity provider already
 * did that, or an address that has been sent a link and used it. The line
 * under the field says which, and a switch that is on with nothing confirmed
 * says plainly that nothing is being sent.
 *
 * The switch is still the save, and the line of state per row is still the
 * one piece of evidence that the schedule is running — a scheduled email
 * gives no sign when it breaks, and an email that does not arrive is
 * indistinguishable from a quiet day.
 */

type RowKey = "matches" | "digest";

type Row = {
  key: RowKey;
  label: string;
  detail: string;
  /** Where the switch is saved. */
  endpoint: string;
  /** Where a test is sent from. */
  testEndpoint: string;
  enabled: boolean;
  /** One line of evidence that the schedule is running, or null when there is none. */
  status: string | null;
  concerning: boolean;
};

type AddressResult = {
  outcome?: string;
  email?: string;
  retryInMinutes?: number;
  error?: string;
  address?: AddressSummary | null;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

const same = (a: string | null | undefined, b: string | null | undefined) =>
  typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

function describeOutcome(result: AddressResult | null, fallback: string): string {
  switch (result?.outcome) {
    case "verified":
      return `Saved. Both emails go to ${result.email}, your sign-in address, so no confirmation is needed.`;
    case "unchanged":
      return `${result.email} is already confirmed.`;
    case "confirmation_sent":
      return `Check ${result.email} for a link from Sartho. Nothing is sent there until it's confirmed.`;
    case "already_sent": {
      const minutes = result.retryInMinutes ?? 1;
      return `A link already went to ${result.email}. You can send another in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    default:
      return result?.error ?? fallback;
  }
}

export function EmailSettings({
  accountEmail,
  address,
  matchAlertsEnabled,
  digestEnabled,
  deliveryReady,
  matchAlertsStatus,
  matchAlertsConcerning,
  digestStatus,
  digestConcerning,
}: {
  /** The address the person signs in with, which needs no confirmation. */
  accountEmail: string | null;
  /** What is saved, or null before anything is. */
  address: AddressSummary | null;
  matchAlertsEnabled: boolean;
  digestEnabled: boolean;
  deliveryReady: boolean;
  /** Decided on the server: it compares stored timestamps against "now". */
  matchAlertsStatus: string | null;
  matchAlertsConcerning: boolean;
  digestStatus: string;
  digestConcerning: boolean;
}) {
  const [confirmed, setConfirmed] = useState<string | null>(address?.confirmed ?? null);
  const [awaiting, setAwaiting] = useState<string | null>(address?.awaitingConfirmation ?? null);
  const [email, setEmail] = useState(address?.awaitingConfirmation ?? address?.confirmed ?? accountEmail ?? "");
  const [matches, setMatches] = useState(matchAlertsEnabled);
  const [digest, setDigest] = useState(digestEnabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  /*
   * The address emails go to today: the confirmed one, or — before anything
   * is saved — the sign-in address the first switch will be saved with.
   */
  const inForce = confirmed ?? (awaiting ? null : accountEmail);
  const canSwitch = Boolean(confirmed || awaiting || accountEmail);

  function apply(result: AddressResult | null) {
    if (!result || result.address === undefined) return;
    setConfirmed(result.address?.confirmed ?? null);
    setAwaiting(result.address?.awaitingConfirmation ?? null);
  }

  async function saveAddress(value: string) {
    const next = value.trim();
    if (!next.includes("@")) return;
    /* Already what is saved, or the sign-in address before anything is: nothing to do. */
    if (same(next, awaiting ?? confirmed ?? accountEmail)) return;
    setBusy("email");
    setNote(null);
    try {
      const response = await fetch("/api/notifications/address", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email: next }),
      });
      const result = (await response.json().catch(() => null)) as AddressResult | null;
      apply(result);
      if (!response.ok) throw new Error(result?.error ?? "Sartho could not save that address.");
      setNote({ text: describeOutcome(result, "Saved."), bad: false });
    } catch (caught) {
      setNote({ text: caught instanceof Error ? caught.message : "Sartho could not save that address.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function switchToAccountAddress() {
    if (!accountEmail) return;
    setEmail(accountEmail);
    await saveAddress(accountEmail);
  }

  async function resend() {
    setBusy("resend");
    setNote(null);
    try {
      const response = await fetch("/api/notifications/address/resend", { method: "POST", headers: JSON_HEADERS, body: "{}" });
      const result = (await response.json().catch(() => null)) as AddressResult | null;
      apply(result);
      if (!response.ok) throw new Error(result?.error ?? "Sartho could not send that.");
      setNote({ text: describeOutcome(result, "Sent."), bad: false });
    } catch (caught) {
      setNote({ text: caught instanceof Error ? caught.message : "Sartho could not send that.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row: Row, value: boolean) {
    /* Flip first: a switch that waits for the network feels broken. */
    if (row.key === "matches") setMatches(value);
    else setDigest(value);
    setBusy(row.key);
    setNote(null);
    try {
      const response = await fetch(row.endpoint, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled: value }),
      });
      const result = (await response.json().catch(() => null)) as AddressResult | null;
      if (!response.ok) throw new Error(result?.error ?? "Sartho could not save that.");
      /* The first switch creates the row with the sign-in address, already confirmed. */
      apply(result);
      setNote({ text: value ? "On — saved." : "Off — saved.", bad: false });
    } catch (caught) {
      if (row.key === "matches") setMatches(!value);
      else setDigest(!value);
      setNote({ text: caught instanceof Error ? caught.message : "Sartho could not save that.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(row: Row) {
    if (!inForce) return;
    setBusy(`test-${row.key}`);
    setNote(null);
    try {
      const response = await fetch(row.testEndpoint, { method: "POST", headers: JSON_HEADERS, body: "{}" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Sartho could not send that.");
      setNote({ text: `Sent to ${inForce}. Check spam if it isn't there in a minute.`, bad: false });
    } catch (caught) {
      setNote({ text: caught instanceof Error ? caught.message : "Sartho could not send that.", bad: true });
    } finally {
      setBusy(null);
    }
  }

  /* The line under the field: what is confirmed, what is waiting, and what to do about it. */
  const line = (() => {
    if (awaiting) {
      return {
        text: confirmed
          ? `Waiting for confirmation at ${awaiting}. Until that link is used, emails still go to ${confirmed}.`
          : `Waiting for confirmation at ${awaiting}. Check that inbox for a link from Sartho; nothing is sent until it's used.`,
        concerning: !confirmed,
        resend: true,
        account: Boolean(accountEmail) && !same(awaiting, accountEmail),
      };
    }
    if (confirmed) {
      return {
        text: same(confirmed, accountEmail) ? `Confirmed: ${confirmed} is your sign-in address.` : `Confirmed. Emails go to ${confirmed}.`,
        concerning: false,
        resend: false,
        account: false,
      };
    }
    if (accountEmail) {
      return { text: `${accountEmail} is your sign-in address, so it needs no confirmation.`, concerning: false, resend: false, account: false };
    }
    return {
      text: "Add an address to turn these on. Any address other than your sign-in one is sent a link to confirm first.",
      concerning: false,
      resend: false,
      account: false,
    };
  })();

  const base: Row[] = [
    {
      key: "matches",
      label: "New matches",
      detail: "Strong matches from your brief that you haven't been shown before. Quiet day, no email.",
      endpoint: "/api/notifications/match-alerts",
      testEndpoint: "/api/notifications/match-alerts",
      enabled: matches,
      status: matchAlertsStatus,
      concerning: matchAlertsConcerning,
    },
    {
      key: "digest",
      label: "Daily summary",
      detail: "Saved opportunities, active applications and recorded outcomes, once every 24 hours.",
      endpoint: "/api/notifications/preferences",
      testEndpoint: "/api/notifications/digest",
      enabled: digest,
      status: digestStatus,
      concerning: digestConcerning,
    },
  ];
  const rows: Row[] = base.map((row) =>
    /* A switch that is on with nothing confirmed is not "waiting for the next run". It is sending nothing. */
    row.enabled && !inForce
      ? { ...row, status: awaiting ? `Nothing is sent until ${awaiting} is confirmed.` : "Nothing is sent until an address is confirmed.", concerning: true }
      : row,
  );

  return (
    <section className="email-settings glass-card" aria-label="Email settings">
      <div className="email-settings__address">
        <label htmlFor="notification-email">Send to</label>
        <input
          id="notification-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => void saveAddress(email)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          placeholder="you@example.com"
        />
      </div>

      <div className={`email-settings__verify${line.concerning ? " is-concerning" : ""}`} role="status">
        <span>{line.text}</span>
        {line.resend ? (
          <button type="button" className="email-settings__link" onClick={() => void resend()} disabled={busy !== null}>
            {busy === "resend" ? "Sending…" : "Send the link again"}
          </button>
        ) : null}
        {line.account ? (
          <button type="button" className="email-settings__link" onClick={() => void switchToAccountAddress()} disabled={busy !== null}>
            Use my sign-in address instead
          </button>
        ) : null}
      </div>

      {!deliveryReady ? (
        <p className="email-settings__warn" role="status">
          Email delivery isn&apos;t connected. Your switches still save, but a new address can&apos;t be sent its confirmation link until it is.
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
                onClick={() => void toggle(row, !row.enabled)}
                disabled={busy !== null || !canSwitch}
              >
                <span aria-hidden="true" />
              </button>
              {/*
                * Kept, and kept small. It is the only way to find out whether
                * delivery works at all without waiting until midnight — and it
                * stays available while the switch is off, because putting the
                * diagnosis behind the thing being diagnosed is useless. It goes
                * to the confirmed address and nowhere else.
                */}
              <button
                type="button"
                className="email-settings__test"
                onClick={() => void sendTest(row)}
                disabled={busy !== null || !inForce || !deliveryReady}
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
