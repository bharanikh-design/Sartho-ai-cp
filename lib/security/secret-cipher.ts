import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * Sealing a secret before it is written to the database.
 *
 * The OAuth refresh token for somebody's Google Drive is the most sensitive
 * thing Sartho stores: a long-lived key to their files. Row Level Security
 * keeps it away from every browser, but a database backup, a logical replica
 * or a leaked service-role key would hand over every token in plaintext. So
 * the token is encrypted with a key that lives only in the application's
 * environment, and the database holds ciphertext it cannot read.
 *
 * AES-256-GCM, with the row's identity as additional authenticated data, so
 * a ciphertext copied from one row to another fails to open. The stored form
 * carries a version prefix so the format can change without guessing:
 *
 *   enc:v1:<iv>.<ciphertext>.<tag>     (each part base64url)
 *
 * Anything without the prefix is a value written before sealing existed. It
 * is read as-is and re-sealed the next time the row is written, so an
 * existing deployment keeps working the moment the key is set and converges
 * to ciphertext on its own.
 *
 * Rotation: set the new key in INTEGRATION_TOKEN_KEY and the old one in
 * INTEGRATION_TOKEN_KEY_PREVIOUS. New writes use the new key; reads try both.
 */

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type SecretCipherStatus = {
  configured: boolean;
  /** Set when a key is present but unusable, which is worse than absent. */
  problem: string | null;
  rotating: boolean;
};

/* A 32-byte key, given as base64 (44 characters) or hex (64 characters). */
function decodeKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  const buffer = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  return buffer.byteLength === KEY_BYTES ? buffer : null;
}

function currentKey(): Buffer | null {
  return decodeKey(process.env.INTEGRATION_TOKEN_KEY);
}

function previousKey(): Buffer | null {
  return decodeKey(process.env.INTEGRATION_TOKEN_KEY_PREVIOUS);
}

export function secretCipherStatus(): SecretCipherStatus {
  const raw = process.env.INTEGRATION_TOKEN_KEY?.trim();
  if (!raw) return { configured: false, problem: null, rotating: false };
  const key = decodeKey(raw);
  if (!key) {
    return {
      configured: false,
      problem: "INTEGRATION_TOKEN_KEY must be 32 random bytes, given as base64 or hex. Generate one with: openssl rand -base64 32",
      rotating: false,
    };
  }
  return { configured: true, problem: null, rotating: previousKey() !== null };
}

export function isSecretCipherConfigured(): boolean {
  return currentKey() !== null;
}

export function isSealedSecret(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

/** Seals a value for storage. Throws when no usable key is configured. */
export function sealSecret(plain: string, context: string): string {
  const key = currentKey();
  if (!key) throw new Error("INTEGRATION_TOKEN_KEY is not configured, so a secret cannot be stored.");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export type OpenedSecret =
  /** Nothing stored. */
  | { state: "empty"; value: null }
  /** Stored before sealing existed; still usable, and worth re-sealing. */
  | { state: "plain"; value: string }
  /** Sealed and opened with a configured key. */
  | { state: "sealed"; value: string }
  /** Sealed, but no configured key opens it: wrong key, or none at all. */
  | { state: "unreadable"; value: null };

/**
 * Reads a stored value back. Never throws: a value that cannot be opened is
 * reported as unreadable so the caller can treat the connection as gone
 * rather than crash a page.
 */
export function openSecret(stored: string | null | undefined, context: string): OpenedSecret {
  if (!stored) return { state: "empty", value: null };
  if (!stored.startsWith(PREFIX)) return { state: "plain", value: stored };

  const [ivPart, ciphertextPart, tagPart] = stored.slice(PREFIX.length).split(".");
  if (!ivPart || !ciphertextPart || !tagPart) return { state: "unreadable", value: null };

  const iv = Buffer.from(ivPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) return { state: "unreadable", value: null };

  for (const key of [currentKey(), previousKey()]) {
    if (!key) continue;
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      return { state: "sealed", value: plain };
    } catch {
      /* Not this key. The previous key, if any, is tried next. */
    }
  }
  return { state: "unreadable", value: null };
}
