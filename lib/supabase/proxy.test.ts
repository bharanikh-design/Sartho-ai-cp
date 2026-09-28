import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { config } from "@/proxy";

/*
 * The session lookup, without a network: nobody is signed in. Every test in
 * this file that reaches the lookup sees that answer, which is the one that
 * matters — the guard's decisions are all about what happens with no user.
 */
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

function withSupabaseEnv() {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  });
  afterAll(() => {
    if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = saved.key;
  });
}

/*
 * Vercel invokes a scheduled job with a bearer secret and no cookies, and an
 * uptime monitor sends nothing at all. The guard used to answer both with
 * 401 before the route could look at the request, which is how neither
 * scheduled email ever went out.
 */
describe("session-free routes", () => {
  withSupabaseEnv();

  it("still guards an ordinary API route when nobody is signed in", async () => {
    const response = await updateSession(new NextRequest("https://sartho.tech/api/jobs"));
    expect(response.status).toBe(401);
  });

  it.each(["/api/cron/daily-digest", "/api/cron/match-alerts", "/api/health"])(
    "hands %s to the route without asking for a session",
    async (pathname) => {
      const response = await updateSession(new NextRequest(`https://sartho.tech${pathname}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );
});

/*
 * A fresh nonce on every response, carried both to the browser (the response
 * header it enforces) and to the renderer (the request header Next reads to
 * put the nonce on every script it emits).
 */
describe("content security policy", () => {
  withSupabaseEnv();

  it("issues a policy with a nonce on a public page", async () => {
    const response = await updateSession(new NextRequest("https://sartho.tech/privacy"));
    expect(response.status).toBe(200);
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(policy).toContain("connect-src 'self' https://project.supabase.co wss://project.supabase.co");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("never repeats a nonce", async () => {
    const first = (await updateSession(new NextRequest("https://sartho.tech/privacy"))).headers.get("content-security-policy");
    const second = (await updateSession(new NextRequest("https://sartho.tech/privacy"))).headers.get("content-security-policy");
    expect(first).not.toBe(second);
  });

  it("does not ask a local http server to upgrade its own requests", async () => {
    const response = await updateSession(new NextRequest("http://localhost:3000/privacy"));
    expect(response.headers.get("content-security-policy")).not.toContain("upgrade-insecure-requests");
  });
});

describe("Supabase auth proxy", () => {
  it.each(["/", "/login"])(
    "recovers an OAuth code that lands on %s",
    async (pathname) => {
      const request = new NextRequest(
        `https://sartho.vercel.app${pathname}?code=one-time-code&next=%2F%3Fcode%3Dstale`,
      );

      const response = await updateSession(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://sartho.vercel.app/auth/callback?code=one-time-code&next=%2F",
      );
    },
  );
});

/*
 * A write to the API from another site is refused before any session lookup,
 * with the browser's own account of where the request came from as the
 * evidence. Reads, and requests with no browser provenance at all, go on to
 * the route's own authentication.
 */
describe("cross-site API writes", () => {
  const api = (method: string, headers: Record<string, string>) =>
    updateSession(new NextRequest("https://sartho.tech/api/jobs", { method, headers }));

  it("refuses a cross-site POST", async () => {
    const response = await api("POST", { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
  });

  it("refuses a POST whose Origin is another host even without Sec-Fetch-Site", async () => {
    const response = await api("DELETE", { origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });

  it("does not refuse a cross-site read, which the route answers on its own terms", async () => {
    const response = await api("GET", { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).not.toBe(403);
  });

  it("lets a same-origin write through to the route", async () => {
    const response = await api("POST", { origin: "https://sartho.tech", "sec-fetch-site": "same-origin" });
    expect(response.status).not.toBe(403);
  });
});

/*
 * The guard runs before routing, so whatever its matcher covers is answered
 * with a redirect no matter what the app would have served. robots.txt and
 * sitemap.xml were covered, and crawlers were handed a sign-in page instead of
 * crawl rules.
 *
 * Both directions are asserted here on purpose. A matcher is only correct if it
 * lets the public files through AND still covers the product; widening it until
 * robots.txt passed would be easy to do while quietly unguarding real routes,
 * which is the worse bug of the two.
 */
describe("auth guard matcher", () => {
  // Approximates how Next.js compiles a regex matcher, which is enough to pin
  // down which pathnames this pattern claims.
  const guarded = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

  it.each([
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/.well-known/security.txt",
    "/favicon.ico",
    "/icon.svg",
    "/_next/static/chunks/main.js",
    /*
     * The extensionless one. Next serves the generated Open Graph image here,
     * and og:image points at it — a redirect makes every shared link render
     * blank while the tags themselves look correct.
     */
    "/opengraph-image",
    "/opengraph-image/2",
    "/twitter-image",
  ])("leaves %s reachable without a session", (pathname) => {
    expect(guarded(pathname)).toBe(false);
  });

  it.each([
    "/",
    "/jobs",
    "/applications",
    "/onboarding",
    "/career-direction",
    "/interview-prep",
    "/diagnostics",
    "/api/jobs",
  ])("still guards %s", (pathname) => {
    expect(guarded(pathname)).toBe(true);
  });

  /*
   * The exclusions are exact filenames, not prefixes. A pattern like "robots"
   * or "icon" would also unguard a real page whose name merely begins that way.
   */
  it.each(["/robots-report", "/sitemap-builder", "/icons", "/manifest-editor"])(
    "does not unguard %s, which only resembles a public file",
    (pathname) => {
      expect(guarded(pathname)).toBe(true);
    },
  );
});
