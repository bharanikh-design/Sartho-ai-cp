/*
 * The Google grant: asking for it, keeping it fresh, and giving it back.
 *
 * Kept out of the routes because the interesting parts are pure — what scopes
 * to ask for, whether a token has expired, what a callback is allowed to
 * redirect to — and those are exactly the parts worth testing without an HTTP
 * request or a live Google in front of them.
 *
 * Nothing here logs a token, returns one, or puts one in an error message.
 */

export const GOOGLE_PROVIDER = "google";

/*
 * Read-only, and only the two things Sartho actually needs.
 *
 *   drive.readonly  — to search for a résumé and read the one that is chosen.
 *   userinfo.email  — so the Integrations page can say which account this is.
 *                     Nobody remembers which of their three Google accounts
 *                     they clicked, and "Connected" with no name beside it is
 *                     an invitation to disconnect the wrong one.
 *
 * Notably absent: anything that writes. Sartho reads a file somebody points it
 * at. It has no reason to create, edit or delete anything in a Drive, so it
 * does not ask for the ability to.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export type GoogleTokens = {
  accessToken: string;
  /** Absent on a re-consent where Google decides you already have one. */
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
};

export function googleOAuthConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleConfigured(): boolean {
  return googleOAuthConfig() !== null;
}

/** The redirect Google is configured to send people back to. */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/integrations/google/callback`;
}

/*
 * The consent URL.
 *
 * Two parameters carry more weight than they look like they do:
 *
 *   access_type=offline  is the only way to be given a refresh token. Without
 *                        it the grant dies in an hour and "connected" becomes
 *                        a lie by lunchtime.
 *   prompt=consent       forces the consent screen even on a reconnect. Google
 *                        issues a refresh token only on the first grant, so a
 *                        reconnect after a revoke would otherwise return an
 *                        access token, no refresh token, and a connection that
 *                        silently expires.
 */
export function googleAuthUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

/*
 * Somebody can untick a scope on the consent screen and Google will happily
 * complete the flow without it. Checking here means the Integrations page can
 * say "Drive access was not granted" instead of the résumé search failing
 * later with a 403 nobody can interpret.
 */
export function grantsDriveAccess(scopes: string[]): boolean {
  return scopes.includes("https://www.googleapis.com/auth/drive.readonly");
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

function readTokens(body: TokenResponse, fallbackScopes: string[]): GoogleTokens {
  if (!body.access_token) throw new Error("Google did not return an access token.");
  /*
   * Sixty seconds short of what Google said. A token that expires while the
   * request carrying it is in flight fails in the least helpful way possible,
   * and the cost of refreshing a minute early is nothing.
   */
  const seconds = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3_600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (seconds - 60) * 1000),
    scopes: body.scope ? body.scope.split(/\s+/).filter(Boolean) : fallbackScopes,
  };
}

async function postToken(params: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as (TokenResponse & { error_description?: string; error?: string }) | null;
  if (!response.ok) {
    /*
     * Google's own words, which distinguish "this code was already used" from
     * "your client secret is wrong" — a difference worth an afternoon.
     */
    throw new Error(body?.error_description || body?.error || `Google returned ${response.status}.`);
  }
  return body ?? {};
}

export async function exchangeCodeForTokens(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  return readTokens(await postToken(new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  })), [...GOOGLE_SCOPES]);
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  knownScopes: string[];
}): Promise<GoogleTokens> {
  const tokens = readTokens(await postToken(new URLSearchParams({
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
  })), input.knownScopes);
  /* A refresh never returns a new refresh token; the stored one stays valid. */
  return { ...tokens, refreshToken: null };
}

/** Whether a stored access token is still worth trying. */
export function isExpired(expiresAt: Date | string | null, now = new Date()): boolean {
  if (!expiresAt) return true;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !Number.isFinite(at.getTime()) || at.getTime() <= now.getTime();
}

/*
 * Disconnecting has to mean it at Google's end too.
 *
 * Deleting the row alone leaves Sartho listed under the person's Google
 * account permissions for ever, with a live refresh token behind it. Somebody
 * who clicks Disconnect means "stop being able to read my Drive", not "forget
 * that you can".
 *
 * Best effort on purpose: if Google is down or the token is already dead, the
 * local row must still go. A disconnect that can fail is a disconnect people
 * cannot rely on.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { email?: string };
    return typeof body.email === "string" ? body.email : null;
  } catch {
    return null;
  }
}
