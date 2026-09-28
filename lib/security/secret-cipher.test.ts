import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isSealedSecret,
  isSecretCipherConfigured,
  openSecret,
  sealSecret,
  secretCipherStatus,
} from "./secret-cipher";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("hex");
const CONTEXT = "google:refresh_token:0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";

const saved = { key: process.env.INTEGRATION_TOKEN_KEY, previous: process.env.INTEGRATION_TOKEN_KEY_PREVIOUS };

function restore(name: "INTEGRATION_TOKEN_KEY" | "INTEGRATION_TOKEN_KEY_PREVIOUS", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.INTEGRATION_TOKEN_KEY = KEY_A;
  delete process.env.INTEGRATION_TOKEN_KEY_PREVIOUS;
});

afterEach(() => {
  restore("INTEGRATION_TOKEN_KEY", saved.key);
  restore("INTEGRATION_TOKEN_KEY_PREVIOUS", saved.previous);
});

describe("sealSecret / openSecret", () => {
  it("round-trips a token and never stores it in the clear", () => {
    const sealed = sealSecret("1//0gRefreshTokenValue", CONTEXT);
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("RefreshToken");
    expect(isSealedSecret(sealed)).toBe(true);
    expect(openSecret(sealed, CONTEXT)).toEqual({ state: "sealed", value: "1//0gRefreshTokenValue" });
  });

  it("uses a fresh IV every time, so equal tokens do not produce equal rows", () => {
    expect(sealSecret("same", CONTEXT)).not.toBe(sealSecret("same", CONTEXT));
  });

  it("binds the ciphertext to its row: another row's context cannot open it", () => {
    const sealed = sealSecret("token", CONTEXT);
    expect(openSecret(sealed, "google:refresh_token:someone-else").state).toBe("unreadable");
    expect(openSecret(sealed, "google:access_token:0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f").state).toBe("unreadable");
  });

  it("refuses a tampered ciphertext or tag", () => {
    const sealed = sealSecret("token", CONTEXT);
    const [prefix, iv, ciphertext, tag] = [sealed.slice(0, 7), ...sealed.slice(7).split(".")];
    const flipped = (part: string) => `${part.slice(0, -2)}${part.endsWith("AA") ? "BB" : "AA"}`;
    expect(openSecret(`${prefix}${iv}.${flipped(ciphertext)}.${tag}`, CONTEXT).state).toBe("unreadable");
    expect(openSecret(`${prefix}${iv}.${ciphertext}.${flipped(tag)}`, CONTEXT).state).toBe("unreadable");
    expect(openSecret("enc:v1:not.even.close", CONTEXT).state).toBe("unreadable");
    expect(openSecret("enc:v1:", CONTEXT).state).toBe("unreadable");
  });

  it("passes a value written before sealing existed straight through, marked plain", () => {
    expect(openSecret("ya29.legacy-access-token", CONTEXT)).toEqual({ state: "plain", value: "ya29.legacy-access-token" });
    expect(isSealedSecret("ya29.legacy-access-token")).toBe(false);
    expect(openSecret(null, CONTEXT)).toEqual({ state: "empty", value: null });
    expect(openSecret("", CONTEXT)).toEqual({ state: "empty", value: null });
  });

  it("opens with the previous key during a rotation, and seals with the new one", () => {
    const sealedWithA = sealSecret("token", CONTEXT);

    process.env.INTEGRATION_TOKEN_KEY = KEY_B;
    expect(openSecret(sealedWithA, CONTEXT).state).toBe("unreadable");

    process.env.INTEGRATION_TOKEN_KEY_PREVIOUS = KEY_A;
    expect(openSecret(sealedWithA, CONTEXT)).toEqual({ state: "sealed", value: "token" });
    expect(secretCipherStatus().rotating).toBe(true);

    const resealed = sealSecret("token", CONTEXT);
    delete process.env.INTEGRATION_TOKEN_KEY_PREVIOUS;
    expect(openSecret(resealed, CONTEXT)).toEqual({ state: "sealed", value: "token" });
  });

  it("accepts a hex key as well as base64", () => {
    process.env.INTEGRATION_TOKEN_KEY = KEY_B;
    expect(isSecretCipherConfigured()).toBe(true);
    expect(openSecret(sealSecret("token", CONTEXT), CONTEXT).value).toBe("token");
  });
});

describe("secretCipherStatus", () => {
  it("reports an absent key as not configured, without a problem", () => {
    delete process.env.INTEGRATION_TOKEN_KEY;
    expect(secretCipherStatus()).toEqual({ configured: false, problem: null, rotating: false });
    expect(isSecretCipherConfigured()).toBe(false);
    expect(() => sealSecret("token", CONTEXT)).toThrow(/INTEGRATION_TOKEN_KEY/);
  });

  it("names a key of the wrong size as a problem rather than silently ignoring it", () => {
    process.env.INTEGRATION_TOKEN_KEY = "too-short";
    const status = secretCipherStatus();
    expect(status.configured).toBe(false);
    expect(status.problem).toMatch(/32 random bytes/);
    expect(isSecretCipherConfigured()).toBe(false);
  });
});
