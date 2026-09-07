import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * The `state` parameter, which is the only thing standing between the OAuth
 * callback and a cross-site request forgery.
 *
 * Without it, anybody can send a signed-in Sartho user to
 * /api/integrations/google/callback?code=... with a code from *their own*
 * Google account, and Sartho would dutifully attach the attacker's Drive to
 * the victim's profile. The victim then imports a résumé the attacker
 * controls — or, worse, the attacker sees whatever the victim does next.
 *
 * So the state carries the user it was minted for, signed, and the callback
 * refuses any state that was not minted for the person holding the session.
 *
 * Stateless on purpose: a nonce in a table would need a row written on every
 * click of Connect and swept up afterwards, and the signature already proves
 * everything the row would have.
 */

/* Ten minutes is generous for a consent screen and short enough to be useless later. */
const MAX_AGE_MS = 10 * 60 * 1000;

type StatePayload = {
  /** The Sartho user this consent was started by. */
  u: string;
  /** Minted at, in milliseconds. */
  t: number;
  /** Makes two states for the same person in the same millisecond differ. */
  n: string;
};

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintState(userId: string, secret: string, now = Date.now()): string {
  const payload = encode({ u: userId, t: now, n: crypto.randomUUID() } satisfies StatePayload);
  return `${payload}.${sign(payload, secret)}`;
}

/*
 * Returns the user id the state was minted for, or null for anything that is
 * not a state this server signed recently.
 *
 * Never throws and never explains which check failed. A caller that could tell
 * "bad signature" from "expired" from "malformed" would hand an attacker a way
 * to probe the format, and there is exactly one useful response to all three.
 */
export function readState(state: string, secret: string, now = Date.now()): string | null {
  if (typeof state !== "string" || !state.includes(".")) return null;
  const separator = state.lastIndexOf(".");
  const payload = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  /*
   * Length is compared first because timingSafeEqual throws on a mismatch —
   * and a comparison that can throw is a comparison that leaks length through
   * the exception rather than through timing.
   */
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<StatePayload>;
    if (typeof decoded.u !== "string" || !decoded.u) return null;
    if (typeof decoded.t !== "number" || !Number.isFinite(decoded.t)) return null;
    /* Rejecting a future timestamp as well: a clock that disagrees is not a licence. */
    if (decoded.t > now + 60_000 || now - decoded.t > MAX_AGE_MS) return null;
    return decoded.u;
  } catch {
    return null;
  }
}
