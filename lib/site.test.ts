import { afterEach, describe, expect, it, vi } from "vitest";

async function loadSite(configured?: string) {
  vi.resetModules();
  if (configured === undefined) delete process.env.NEXT_PUBLIC_AUTH_ORIGINS;
  else process.env.NEXT_PUBLIC_AUTH_ORIGINS = configured;
  return import("./site");
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_ORIGINS;
});

/*
 * The bug these guard against: a sign-in that starts on one host and finishes
 * on another loses the PKCE code verifier, because the cookie holding it is
 * never sent across hosts. So the only origin a flow may be sent back to is one
 * it is allowed to have started on.
 */
describe("auth origins", () => {
  it("allows the canonical origin with no configuration at all", async () => {
    const { AUTH_ORIGIN, isAllowedAuthOrigin } = await loadSite();

    expect(isAllowedAuthOrigin(AUTH_ORIGIN)).toBe(true);
    expect(isAllowedAuthOrigin("https://www.sartho.tech")).toBe(false);
    expect(isAllowedAuthOrigin("https://sartho.vercel.app")).toBe(false);
  });

  it("admits the origins a deployment declares, trimmed of stray spacing and slashes", async () => {
    const { isAllowedAuthOrigin } = await loadSite(
      " https://www.sartho.tech/ , http://localhost:3000 ,, ",
    );

    expect(isAllowedAuthOrigin("https://www.sartho.tech")).toBe(true);
    expect(isAllowedAuthOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedAuthOrigin("https://sartho.vercel.app")).toBe(false);
  });

  /*
   * A near-miss host is the whole failure mode, so it has to stay a miss. Host
   * suffixes and ports are different origins to a browser's cookie jar even
   * when they read as the same site to a person.
   */
  it("does not admit an origin that merely resembles an allowed one", async () => {
    const { isAllowedAuthOrigin } = await loadSite("http://localhost:3000");

    expect(isAllowedAuthOrigin("http://localhost:3001")).toBe(false);
    expect(isAllowedAuthOrigin("https://sartho.tech.evil.example")).toBe(false);
    expect(isAllowedAuthOrigin("https://evil-sartho.tech")).toBe(false);
    expect(isAllowedAuthOrigin("")).toBe(false);
    expect(isAllowedAuthOrigin(null)).toBe(false);
  });

  it("keeps a flow on its own origin, and hands off the ones Supabase would reject", async () => {
    const { AUTH_ORIGIN, resolveAuthOrigin } = await loadSite("https://www.sartho.tech");

    expect(resolveAuthOrigin("https://www.sartho.tech")).toBe("https://www.sartho.tech");
    expect(resolveAuthOrigin(AUTH_ORIGIN)).toBe(AUTH_ORIGIN);
    // Not declared, so it must not be trusted to finish what it starts.
    expect(resolveAuthOrigin("https://sartho-git-preview.vercel.app")).toBe(AUTH_ORIGIN);
    expect(resolveAuthOrigin(undefined)).toBe(AUTH_ORIGIN);
  });

  /*
   * The handoff is a single hop by construction: the origin it lands on is
   * always allowed, so it never hands off again. Were that not true, the two
   * hosts would bounce the user between them forever.
   */
  it("resolves to a fixed point, so a handoff cannot loop", async () => {
    const { resolveAuthOrigin } = await loadSite();
    const once = resolveAuthOrigin("https://sartho.vercel.app");

    expect(resolveAuthOrigin(once)).toBe(once);
  });
});
