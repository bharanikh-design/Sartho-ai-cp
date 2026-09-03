import type { MetadataRoute } from "next";

/*
 * Sartho had no robots.txt at all, and the auth guard answered the request with
 * a 307 to /login. Google treats a robots.txt it cannot parse as though the site
 * published no rules, so the effective policy was "crawl anything" — decided by
 * accident rather than chosen.
 *
 * The public surface is the sign-in page, which should be findable. Everything
 * behind it already redirects an anonymous request, so these rules state that
 * intent rather than relying on the redirect to imply it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Endpoints, not pages: nothing here is meaningful in a search result,
      // and /auth carries one-time codes that must never be followed.
      disallow: ["/api/", "/auth/"],
    },
  };
}
