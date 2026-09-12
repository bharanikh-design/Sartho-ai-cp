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
  /*
   * Every host a visitor can actually arrive on has to work out of the box.
   * Leaving www or the Vercel domain to a deployment variable would mean an
   * unset variable locks people out rather than merely degrading something.
   */
  it("allows each stable product host with no configuration at all", async () => {
    const { AUTH_ORIGIN, isAllowedAuthOrigin } = await loadSite();

    expect(isAllowedAuthOrigin(AUTH_ORIGIN)).toBe(true);
    expect(isAllowedAuthOrigin("https://www.sartho.tech")).toBe(true);
    expect(isAllowedAuthOrigin("https://sartho.vercel.app")).toBe(true);
  });

  /*
   * Preview branches are the deliberate exception. One that Supabase has not
   * been shown would have its redirectTo refused and be bounced to the Site
   * URL — the very failure this list exists to prevent — so it must stay out
   * until a deployment declares it.
   */
  it("leaves an undeclared preview host out until it is declared", async () => {
    const preview = "https://sartho-git-agent-ai-reliability-sartho.vercel.app";

    expect((await loadSite()).isAllowedAuthOrigin(preview)).toBe(false);
    expect((await loadSite(preview)).isAllowedAuthOrigin(preview)).toBe(true);
  });

  it("admits the origins a deployment declares, trimmed of stray spacing and slashes", async () => {
    const { isAllowedAuthOrigin, AUTH_ORIGINS } = await loadSite(
      " https://www.sartho.tech/ , http://localhost:3000 ,, ",
    );

    expect(isAllowedAuthOrigin("http://localhost:3000")).toBe(true);
    // Already a default; declaring it again must not list it twice.
    expect(AUTH_ORIGINS.filter((o) => o === "https://www.sartho.tech")).toHaveLength(1);
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
    expect(isAllowedAuthOrigin("http://www.sartho.tech")).toBe(false);
    expect(isAllowedAuthOrigin("")).toBe(false);
    expect(isAllowedAuthOrigin(null)).toBe(false);
  });

  it("keeps a flow on its own origin, and hands off the ones Supabase would reject", async () => {
    const { AUTH_ORIGIN, resolveAuthOrigin } = await loadSite();

    expect(resolveAuthOrigin("https://www.sartho.tech")).toBe("https://www.sartho.tech");
    expect(resolveAuthOrigin("https://sartho.vercel.app")).toBe("https://sartho.vercel.app");
    expect(resolveAuthOrigin(AUTH_ORIGIN)).toBe(AUTH_ORIGIN);
    expect(resolveAuthOrigin("https://sartho-git-preview-sartho.vercel.app")).toBe(AUTH_ORIGIN);
    expect(resolveAuthOrigin(undefined)).toBe(AUTH_ORIGIN);
  });

  /*
   * The handoff is a single hop by construction: the origin it lands on is
   * always allowed, so it never hands off again. Were that not true, the two
   * hosts would bounce the user between them forever.
   */
  it("resolves to a fixed point, so a handoff cannot loop", async () => {
    const { resolveAuthOrigin } = await loadSite();
    const once = resolveAuthOrigin("https://sartho-git-preview-sartho.vercel.app");

    expect(resolveAuthOrigin(once)).toBe(once);
  });
});
