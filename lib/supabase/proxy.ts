import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicPath, isSessionFreePath } from "@/lib/public-paths";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/content-security-policy";
import { isCrossSiteRequest, isMutatingMethod, publicHost } from "@/lib/security/same-origin";

/*
 * Supabase normally returns an OAuth authorization code to /auth/callback.
 * If the dashboard redirect allowlist falls back to the site URL, however,
 * the code can arrive at / or /login instead. Sending that request through
 * the ordinary auth guard loses the one-time code and makes the user start a
 * second Google round trip. Recover it before any session lookup and route it
 * through the same callback handler that performs the PKCE exchange.
 */
function recoverOAuthCallback(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const code = request.nextUrl.searchParams.get("code");

  if (!code || (pathname !== "/" && pathname !== "/login")) return null;

  const callbackUrl = request.nextUrl.clone();
  callbackUrl.pathname = "/auth/callback";
  callbackUrl.search = "";
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("next", "/");
  return NextResponse.redirect(callbackUrl);
}

type Policy = { nonce: string; header: string };

/*
 * A fresh nonce and the Content-Security-Policy built around it, once per
 * request. Next reads the policy off the request headers while it renders
 * and puts the nonce on every script it emits; the same policy goes out on
 * the response so the browser enforces it.
 */
function policyFor(request: NextRequest): Policy {
  const nonce = createNonce();
  const header = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    isDevelopment: process.env.NODE_ENV === "development",
    isSecure: request.nextUrl.protocol === "https:",
  });
  return { nonce, header };
}

/*
 * Built from the request's headers as they are now, not as they were when
 * the request arrived: the session refresh below rewrites the cookie header
 * and then asks for a new response, and a snapshot taken earlier would hand
 * the page the stale cookies.
 */
function continueWithPolicy(request: NextRequest, policy: Policy) {
  const headers = new Headers(request.headers);
  headers.set("x-nonce", policy.nonce);
  headers.set("Content-Security-Policy", policy.header);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy.header);
  return response;
}

export async function updateSession(request: NextRequest) {
  const recoveredCallback = recoverOAuthCallback(request);
  if (recoveredCallback) return recoveredCallback;

  const pathname = request.nextUrl.pathname;

  /*
   * A write to the API from another site is refused before the session is
   * even looked up. The cookie would make it the signed-in person's write.
   */
  if (
    pathname.startsWith("/api/")
    && isMutatingMethod(request.method)
    && isCrossSiteRequest(request.headers, publicHost(request.headers, request.nextUrl.host))
  ) {
    return NextResponse.json({ error: "Cross-site requests are not accepted." }, { status: 403 });
  }

  const policy = policyFor(request);

  /*
   * The scheduled jobs and the health check carry no session and never will:
   * Vercel invokes a cron with a bearer secret, and an uptime monitor sends
   * nothing at all. Both routes do their own checking. Looking for a session
   * here answered every scheduled run with 401 before the route could read
   * its secret, which is how neither email ever went out.
   */
  if (isSessionFreePath(pathname)) return continueWithPolicy(request, policy);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return continueWithPolicy(request, policy);
  }

  let response = continueWithPolicy(request, policy);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = continueWithPolicy(request, policy);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = isPublicPath(pathname);

  if (!user && !isPublic) {
    /*
     * An API caller needs an answer it can parse, not a login page. Redirecting
     * here hands a fetch() an HTML document with a 307, which then fails inside
     * response.json() and surfaces to the user as a parse error rather than
     * "your session expired".
     */
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}
