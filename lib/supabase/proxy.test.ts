import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { config } from "@/proxy";

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
