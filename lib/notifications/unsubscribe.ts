import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * A way out of every email Sartho sends, that needs no account.
 *
 * Every address in notification_preferences has said yes — it is the
 * account's own sign-in address, or one confirmed from a link sent to it —
 * but a message can still reach the wrong person: a shared inbox, a forwarded
 * email, a link used in a hurry. Whoever holds the message must be able to
 * stop the next one from the message itself. The link
 * carries a signed token naming the account the preference belongs to, and
 * nothing else: no email address, no user data, nothing that reads as a
 * secret if the message is forwarded.
 *
 * Signed with HMAC-SHA256 over the user id. The key is
 * NOTIFICATIONS_UNSUBSCRIBE_SECRET, falling back to CRON_SECRET so a
 * deployment that already sends scheduled email has a key without another
 * setting. With neither, no link is produced and the email says so.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signingKey(): string | null {
  return process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null;
}

function signature(userId: string, key: string): Buffer {
  return createHmac("sha256", key).update(`unsubscribe:${userId.toLowerCase()}`).digest();
}

export function unsubscribeToken(userId: string): string | null {
  const key = signingKey();
  if (!key || !UUID.test(userId)) return null;
  return `${userId.toLowerCase()}.${signature(userId, key).toString("base64url")}`;
}

/** The user id the token names, or null if it is malformed, forged or unsigned. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  const key = signingKey();
  if (!key || !token) return null;
  const [userId, encoded] = token.split(".");
  if (!userId || !encoded || !UUID.test(userId)) return null;

  let presented: Buffer;
  try {
    presented = Buffer.from(encoded, "base64url");
  } catch {
    return null;
  }
  const expected = signature(userId, key);
  if (presented.byteLength !== expected.byteLength) return null;
  return timingSafeEqual(presented, expected) ? userId.toLowerCase() : null;
}

export function unsubscribeUrl(appUrl: string, userId: string): string | null {
  const token = unsubscribeToken(userId);
  if (!token) return null;
  return `${appUrl.replace(/\/+$/, "")}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}
