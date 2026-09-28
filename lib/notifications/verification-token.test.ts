import { describe, expect, it } from "vitest";
import {
  createVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
  verificationTokenMatches,
} from "./verification-token";

describe("verification tokens", () => {
  it("issues a fresh, well-formed token whose hash is what gets stored", () => {
    const first = createVerificationToken();
    const second = createVerificationToken();
    expect(isWellFormedVerificationToken(first.token)).toBe(true);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashVerificationToken(first.token));
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toContain(first.token);
  });

  it("matches only the token the hash was made from", () => {
    const { token, hash } = createVerificationToken();
    expect(verificationTokenMatches(token, hash)).toBe(true);
    expect(verificationTokenMatches(`${token.slice(0, -1)}x`, hash)).toBe(false);
    expect(verificationTokenMatches(token, hashVerificationToken("other"))).toBe(false);
    expect(verificationTokenMatches(token, null)).toBe(false);
    expect(verificationTokenMatches(token, "")).toBe(false);
  });

  it("recognises the shape of a real token and nothing else", () => {
    expect(isWellFormedVerificationToken(createVerificationToken().token)).toBe(true);
    expect(isWellFormedVerificationToken("")).toBe(false);
    expect(isWellFormedVerificationToken("short")).toBe(false);
    expect(isWellFormedVerificationToken("a".repeat(43) + "!")).toBe(false);
    expect(isWellFormedVerificationToken(null)).toBe(false);
  });
});
