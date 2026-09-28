import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_URL } from "@/lib/site";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/notifications/send-email";
import { renderVerificationEmail } from "@/lib/notifications/verification-email";
import {
  createVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
} from "@/lib/notifications/verification-token";

/*
 * Where Sartho's emails go, and whether they may.
 *
 * An address is either the account's own sign-in address, verified by the
 * identity provider the moment the person signed in, or one that has been
 * confirmed from a link sent to it. Nothing is ever sent to an address that
 * is neither. This module is the only place the address or its verification
 * is written, and every write goes through the service role: the browser's
 * own database grant no longer covers this table.
 */

export const VERIFICATION_TTL_HOURS = 24;
export const MIN_MINUTES_BETWEEN_CONFIRMATIONS = 5;

const TABLE = "notification_preferences";
const COLUMNS = [
  "user_id", "email", "email_verified_at", "pending_email", "verification_sent_at", "verification_expires_at",
  "daily_digest_enabled", "match_alerts_enabled", "last_sent_at", "match_alerts_last_run_at", "updated_at",
  "daily_digest_last_test_at", "match_alerts_last_test_at",
].join(",");

type Row = {
  user_id: string;
  email: string | null;
  email_verified_at: string | null;
  pending_email: string | null;
  verification_sent_at: string | null;
  verification_expires_at: string | null;
  daily_digest_enabled: boolean | null;
  match_alerts_enabled: boolean | null;
  last_sent_at: string | null;
  match_alerts_last_run_at: string | null;
  updated_at: string | null;
  daily_digest_last_test_at: string | null;
  match_alerts_last_test_at: string | null;
};

export type NotificationAddress = {
  /** The address scheduled email goes to. Only used when `verified` is true. */
  email: string | null;
  verified: boolean;
  /** A replacement waiting for its link to be clicked; `email` stays in force meanwhile. */
  pendingEmail: string | null;
  /** The address a confirmation link is outstanding for, if any. */
  awaitingConfirmation: string | null;
  verificationSentAt: string | null;
  digestEnabled: boolean;
  matchAlertsEnabled: boolean;
  lastSentAt: string | null;
  matchAlertsLastRunAt: string | null;
  updatedAt: string | null;
  digestLastTestAt: string | null;
  matchAlertsLastTestAt: string | null;
};

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The account's own sign-in address needs no confirmation: the identity provider did that. */
export function isAccountAddress(candidate: string, accountEmail: string | null | undefined): boolean {
  return sameAddress(candidate, accountEmail);
}

/** The address a link is outstanding for: a pending replacement, or the only address if it is unconfirmed. */
function awaitingAddress(row: Row): string | null {
  return row.pending_email ?? (row.email_verified_at ? null : row.email);
}

export function toNotificationAddress(row: Row | null): NotificationAddress | null {
  if (!row) return null;
  const verified = Boolean(row.email_verified_at) && Boolean(row.email);
  return {
    email: row.email ?? null,
    verified,
    pendingEmail: row.pending_email ?? null,
    awaitingConfirmation: awaitingAddress(row),
    verificationSentAt: row.verification_sent_at ?? null,
    digestEnabled: Boolean(row.daily_digest_enabled),
    matchAlertsEnabled: Boolean(row.match_alerts_enabled),
    lastSentAt: row.last_sent_at ?? null,
    matchAlertsLastRunAt: row.match_alerts_last_run_at ?? null,
    updatedAt: row.updated_at ?? null,
    digestLastTestAt: row.daily_digest_last_test_at ?? null,
    matchAlertsLastTestAt: row.match_alerts_last_test_at ?? null,
  };
}

/** The address a scheduled email may go to, or null when there is none yet. */
export function deliverableAddress(address: NotificationAddress | null): string | null {
  return address?.verified && address.email ? address.email : null;
}

async function readRow(client: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await client.from(TABLE).select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("Unable to read notification preferences", { code: error.code });
    return null;
  }
  return (data as Row | null) ?? null;
}

/** Works with the person's own client (RLS-scoped) or the service role. */
export async function loadNotificationAddress(client: SupabaseClient, userId: string): Promise<NotificationAddress | null> {
  return toNotificationAddress(await readRow(client, userId));
}

export type AddressOutcome =
  | { outcome: "verified"; email: string }
  | { outcome: "unchanged"; email: string }
  | { outcome: "confirmation_sent"; email: string }
  | { outcome: "already_sent"; email: string; retryInMinutes: number }
  | { outcome: "nothing_pending" }
  | { outcome: "delivery_unavailable" }
  | { outcome: "send_failed"; message: string }
  | { outcome: "failed" };

function minutesSince(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 60_000;
}

/*
 * One confirmation email per account per cooldown, whatever the address.
 * Keyed on the account rather than the address on purpose: a cooldown that
 * reset with each new address would let one account send a Sartho-branded
 * email to a different stranger every second.
 */
function withinCooldown(row: Row | null): Extract<AddressOutcome, { outcome: "already_sent" }> | null {
  if (!row) return null;
  const elapsed = minutesSince(row.verification_sent_at);
  if (elapsed >= MIN_MINUTES_BETWEEN_CONFIRMATIONS) return null;
  const awaiting = awaitingAddress(row);
  if (!awaiting) return null;
  return { outcome: "already_sent", email: awaiting, retryInMinutes: Math.max(1, Math.ceil(MIN_MINUTES_BETWEEN_CONFIRMATIONS - elapsed)) };
}

/*
 * Sends the confirmation link for `address` and records the hash. The row
 * must already exist. Keeps the confirmed address in force when there is
 * one: the new address lives in pending_email until its link is clicked.
 */
async function sendConfirmation(
  admin: SupabaseClient,
  row: Row,
  address: string,
  appUrl: string,
): Promise<AddressOutcome> {
  if (!isEmailDeliveryConfigured()) return { outcome: "delivery_unavailable" };

  const { token, hash } = createVerificationToken();
  const now = new Date();
  const expires = new Date(now.getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
  const keepsConfirmed = Boolean(row.email_verified_at) && !sameAddress(row.email, address);

  const { error } = await admin
    .from(TABLE)
    .update({
      ...(keepsConfirmed ? { pending_email: address } : { email: address, email_verified_at: null, pending_email: null }),
      verification_token_hash: hash,
      verification_sent_at: now.toISOString(),
      verification_expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("user_id", row.user_id);
  if (error) {
    console.error("Unable to record a pending notification address", { code: error.code });
    return { outcome: "failed" };
  }

  const confirmUrl = `${appUrl.replace(/\/+$/, "")}/api/notifications/verify?token=${encodeURIComponent(token)}`;
  const email = renderVerificationEmail({ address, confirmUrl, expiresInHours: VERIFICATION_TTL_HOURS });
  try {
    await sendEmail(address, email.subject, email.html);
  } catch (caught) {
    return { outcome: "send_failed", message: caught instanceof Error ? caught.message : "Email delivery failed." };
  }
  return { outcome: "confirmation_sent", email: address };
}

/*
 * The person typed an address. Their own sign-in address is accepted at once;
 * anything else is written as pending and sent a link.
 */
export async function setNotificationAddress(
  admin: SupabaseClient,
  input: { userId: string; accountEmail: string | null | undefined; requested: string; appUrl?: string },
): Promise<AddressOutcome> {
  const requested = input.requested.trim();
  const now = new Date().toISOString();
  const row = await readRow(admin, input.userId);

  if (isAccountAddress(requested, input.accountEmail)) {
    const { error } = await admin.from(TABLE).upsert(
      {
        user_id: input.userId,
        email: requested,
        email_verified_at: now,
        pending_email: null,
        verification_token_hash: null,
        verification_sent_at: null,
        verification_expires_at: null,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("Unable to save the notification address", { code: error.code });
      return { outcome: "failed" };
    }
    return { outcome: "verified", email: requested };
  }

  if (row?.email_verified_at && sameAddress(row.email, requested)) {
    /* Already the confirmed address; a pending replacement is withdrawn. */
    if (row.pending_email) {
      await admin
        .from(TABLE)
        .update({ pending_email: null, verification_token_hash: null, verification_sent_at: null, verification_expires_at: null, updated_at: now })
        .eq("user_id", input.userId);
    }
    return { outcome: "unchanged", email: requested };
  }

  const waiting = withinCooldown(row);
  if (waiting) return waiting;

  let current = row;
  if (!current) {
    /* First address for this account, and not their own: it starts unconfirmed. */
    const { data, error } = await admin
      .from(TABLE)
      .insert({ user_id: input.userId, email: requested, email_verified_at: null, updated_at: now })
      .select(COLUMNS)
      .single();
    if (error || !data) {
      console.error("Unable to create notification preferences", { code: error?.code });
      return { outcome: "failed" };
    }
    current = data as unknown as Row;
  }

  return sendConfirmation(admin, current, requested, input.appUrl ?? APP_URL);
}

/** Another link for the address that is waiting, subject to the same cooldown. */
export async function resendConfirmation(
  admin: SupabaseClient,
  input: { userId: string; appUrl?: string },
): Promise<AddressOutcome> {
  const row = await readRow(admin, input.userId);
  const awaiting = row ? awaitingAddress(row) : null;
  if (!row || !awaiting) return { outcome: "nothing_pending" };
  const waiting = withinCooldown(row);
  if (waiting) return waiting;
  return sendConfirmation(admin, row, awaiting, input.appUrl ?? APP_URL);
}

export type ConfirmOutcome = "confirmed" | "invalid" | "expired";

/*
 * The link was clicked. The token is looked up by its hash; a match that has
 * not expired promotes the waiting address to the confirmed one and clears
 * the token, so a link works exactly once.
 */
export async function confirmNotificationAddress(admin: SupabaseClient, token: string | null | undefined): Promise<ConfirmOutcome> {
  if (!isWellFormedVerificationToken(token)) return "invalid";
  const hash = hashVerificationToken(token);

  const { data, error } = await admin
    .from(TABLE)
    .select(COLUMNS)
    .eq("verification_token_hash", hash)
    .maybeSingle();
  if (error) {
    console.error("Unable to look up a confirmation token", { code: error.code });
    return "invalid";
  }
  const row = (data as Row | null) ?? null;
  if (!row) return "invalid";

  if (!row.verification_expires_at || new Date(row.verification_expires_at).getTime() < Date.now()) return "expired";

  const address = row.pending_email ?? row.email;
  if (!address) return "invalid";

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from(TABLE)
    .update({
      email: address,
      email_verified_at: now,
      pending_email: null,
      verification_token_hash: null,
      verification_sent_at: null,
      verification_expires_at: null,
      updated_at: now,
    })
    .eq("user_id", row.user_id)
    .eq("verification_token_hash", hash);
  if (updateError) {
    console.error("Unable to confirm a notification address", { code: updateError.code });
    return "invalid";
  }
  return "confirmed";
}

/*
 * The row, created on first use with the account's own address, which needs
 * no confirmation. Somebody with no sign-in address has to add one first.
 */
export async function ensureNotificationRow(
  admin: SupabaseClient,
  input: { userId: string; accountEmail: string | null | undefined },
): Promise<{ ok: true; address: NotificationAddress } | { ok: false; reason: "no_address" | "failed" }> {
  const row = await readRow(admin, input.userId);
  if (row) return { ok: true, address: toNotificationAddress(row) as NotificationAddress };

  const accountEmail = input.accountEmail?.trim();
  if (!accountEmail) return { ok: false, reason: "no_address" };
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(TABLE)
    .insert({ user_id: input.userId, email: accountEmail, email_verified_at: now, updated_at: now })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    console.error("Unable to create notification preferences", { code: error?.code });
    return { ok: false, reason: "failed" };
  }
  return { ok: true, address: toNotificationAddress(data as unknown as Row) as NotificationAddress };
}

/** One switch. The address is untouched; it has its own path and its own confirmation. */
export async function setNotificationSwitch(
  admin: SupabaseClient,
  input: { userId: string; accountEmail: string | null | undefined; column: "daily_digest_enabled" | "match_alerts_enabled"; enabled: boolean },
): Promise<{ ok: true; address: NotificationAddress } | { ok: false; reason: "no_address" | "failed" }> {
  const ensured = await ensureNotificationRow(admin, input);
  if (!ensured.ok) return ensured;

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(TABLE)
    .update({ [input.column]: input.enabled, updated_at: now })
    .eq("user_id", input.userId)
    .select(COLUMNS)
    .single();
  if (error || !data) {
    console.error("Unable to save a notification preference", { code: error?.code });
    return { ok: false, reason: "failed" };
  }
  return { ok: true, address: toNotificationAddress(data as unknown as Row) as NotificationAddress };
}

/** Records that a test email went out, without touching the schedule's own timestamp. */
export async function recordTestSend(
  admin: SupabaseClient,
  input: { userId: string; column: "daily_digest_last_test_at" | "match_alerts_last_test_at" },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from(TABLE).update({ [input.column]: now, updated_at: now }).eq("user_id", input.userId);
  if (error) console.error("Unable to record a test send", { code: error.code });
}
