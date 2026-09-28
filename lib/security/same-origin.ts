/*
 * Is a state-changing API request coming from this site?
 *
 * Every API route authenticates with the session cookie, so a page on another
 * origin that can make the browser send a request here would be acting as the
 * signed-in person. The cookies are SameSite=Lax, which stops the plain case;
 * this is the second lock, using what the browser itself says about where the
 * request came from.
 *
 * Two signals, either of which is enough to refuse: the Sec-Fetch-Site header
 * every current browser attaches, and the Origin header that accompanies any
 * cross-origin request. A request with neither — a server-side caller, a
 * scheduled job, a test runner — is not a browser and is let through to the
 * route's own authentication.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

export function isCrossSiteRequest(headers: Headers, requestHost: string): boolean {
  const fetchSite = headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return true;
  if (fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none") return false;

  const origin = headers.get("origin");
  if (!origin || origin === "null") return origin === "null";

  try {
    return new URL(origin).host.toLowerCase() !== requestHost.toLowerCase();
  } catch {
    return true;
  }
}

/*
 * The host the request was addressed to, as the browser saw it. Behind a
 * proxy that rewrites Host, X-Forwarded-Host is the public one.
 */
export function publicHost(headers: Headers, fallback: string): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || headers.get("host") || fallback;
}
