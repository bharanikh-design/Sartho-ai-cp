import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * The token in a confirmation link.
 *
 * 32 random bytes, sent once and never stored: the database keeps its SHA-256,
 * so a copy of the table cannot be turned into a set of working links. The
 * lookup compares hashes, in constant time, and the link expires in a day.
 */

export const VERIFICATION_TOKEN_BYTES = 32;

export type VerificationToken = { token: string; hash: string };

export function createVerificationToken(): VerificationToken {
  const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashVerificationToken(token) };
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Whether a presented token is the one a stored hash was made from. */
export function verificationTokenMatches(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const presented = Buffer.from(hashVerificationToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return presented.byteLength === expected.byteLength && timingSafeEqual(presented, expected);
}

/** A token as it appears in a link: base64url of 32 bytes, and nothing else. */
export function isWellFormedVerificationToken(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
