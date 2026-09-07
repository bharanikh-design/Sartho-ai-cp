import { createAdminClient } from "@/lib/supabase/admin";
import {
  GOOGLE_PROVIDER,
  googleOAuthConfig,
  grantsDriveAccess,
  isExpired,
  refreshAccessToken,
  revokeToken,
  type GoogleTokens,
} from "@/lib/integrations/google";

/*
 * The one door to integration_connections.
 *
 * That table has RLS enabled with no policies, so it is unreachable from a
 * browser under any circumstance — a stolen session, a mistaken
 * `select("*")`, a bug in an unrelated route. Everything that needs it comes
 * through here, on the server, with the service role.
 *
 * The rule this module exists to enforce: a token goes in, and only a token's
 * *consequences* come out. `connectionStatus` returns what the Integrations
 * page may say out loud; `googleAccessToken` returns a token to server code
 * that is about to spend it. Nothing returns a refresh token, ever.
 */

export type ConnectionStatus = {
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  /** False when somebody unticked Drive on the consent screen. */
  driveGranted: boolean;
};

const DISCONNECTED: ConnectionStatus = {
  connected: false,
  accountEmail: null,
  connectedAt: null,
  driveGranted: false,
};

type ConnectionRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  account_email: string | null;
  connected_at: string | null;
};

async function readRow(userId: string): Promise<ConnectionRow | null> {
  const { data, error } = await createAdminClient()
    .from("integration_connections")
    .select("access_token,refresh_token,expires_at,scopes,account_email,connected_at")
    .eq("user_id", userId)
    .eq("provider", GOOGLE_PROVIDER)
    .maybeSingle();
  if (error) {
    /* The code, never the row: the row is the thing we are protecting. */
    console.error("Unable to read an integration connection", { code: error.code });
    return null;
  }
  return (data as ConnectionRow | null) ?? null;
}

/** What the Integrations page is allowed to know. */
export async function connectionStatus(userId: string): Promise<ConnectionStatus> {
  const row = await readRow(userId);
  if (!row?.refresh_token && !row?.access_token) return DISCONNECTED;
  return {
    connected: true,
    accountEmail: row.account_email,
    connectedAt: row.connected_at,
    driveGranted: grantsDriveAccess(row.scopes ?? []),
  };
}

export async function saveGoogleConnection(input: {
  userId: string;
  tokens: GoogleTokens;
  accountEmail: string | null;
}): Promise<boolean> {
  const existing = await readRow(input.userId);
  const { error } = await createAdminClient().from("integration_connections").upsert({
    user_id: input.userId,
    provider: GOOGLE_PROVIDER,
    access_token: input.tokens.accessToken,
    /*
     * Google issues a refresh token on the first grant and, in some re-consent
     * paths, not again. Overwriting the stored one with null would turn a
     * working connection into one that dies within the hour, with nothing to
     * show for it — so an absent refresh token keeps whatever is already there.
     */
    refresh_token: input.tokens.refreshToken ?? existing?.refresh_token ?? null,
    expires_at: input.tokens.expiresAt.toISOString(),
    scopes: input.tokens.scopes,
    account_email: input.accountEmail ?? existing?.account_email ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Unable to save an integration connection", { code: error.code });
    return false;
  }
  return true;
}

/*
 * A usable access token, refreshed if it has expired.
 *
 * Returns null rather than throwing when there is no connection or the grant
 * has been revoked at Google's end — which happens without warning, from the
 * Google account permissions page, and is a normal thing for a person to do
 * rather than an error in Sartho.
 */
export async function googleAccessToken(userId: string): Promise<string | null> {
  const config = googleOAuthConfig();
  if (!config) return null;

  const row = await readRow(userId);
  if (!row) return null;

  if (row.access_token && !isExpired(row.expires_at)) return row.access_token;
  if (!row.refresh_token) return null;

  try {
    const refreshed = await refreshAccessToken({
      refreshToken: row.refresh_token,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      knownScopes: row.scopes ?? [],
    });
    await createAdminClient()
      .from("integration_connections")
      .update({
        access_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", GOOGLE_PROVIDER);
    return refreshed.accessToken;
  } catch (caught) {
    /*
     * Almost always a grant revoked at Google's end. The message, not the
     * token — and the connection is left in place so the Integrations page can
     * still show it and offer to reconnect, rather than vanishing and leaving
     * somebody wondering whether they ever connected at all.
     */
    console.error("Unable to refresh a Google token", {
      message: caught instanceof Error ? caught.message : "unknown",
    });
    return null;
  }
}

/*
 * Disconnect, and mean it at Google's end.
 *
 * The revoke is attempted first and its result ignored: if Google is
 * unreachable or the token is already dead, the row must still go. A
 * disconnect that can fail is a disconnect nobody can rely on, and the promise
 * this button makes is the whole reason the Integrations page exists.
 */
export async function disconnectGoogle(userId: string): Promise<boolean> {
  const row = await readRow(userId);
  const token = row?.refresh_token ?? row?.access_token;
  if (token) await revokeToken(token);

  const { error } = await createAdminClient()
    .from("integration_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", GOOGLE_PROVIDER);
  if (error) {
    console.error("Unable to remove an integration connection", { code: error.code });
    return false;
  }
  return true;
}
