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
import { isSecretCipherConfigured, openSecret, sealSecret } from "@/lib/security/secret-cipher";

/*
 * The one door to integration_connections.
 *
 * That table has RLS enabled with no policies, so it is unreachable from a
 * browser under any circumstance — a stolen session, a mistaken
 * `select("*")`, a bug in an unrelated route. Everything that needs it comes
 * through here, on the server, with the service role.
 *
 * And what the table holds is ciphertext. The tokens are sealed with the key
 * in INTEGRATION_TOKEN_KEY before they are written and opened after they are
 * read, so a backup, a replica or a leaked service-role key yields nothing
 * that opens a Drive. Rows written before sealing existed are read as they
 * are and re-sealed on the next read, so the change needs no migration.
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

/* The row, opened. Tokens are in the clear here and nowhere else. */
type Connection = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  accountEmail: string | null;
  connectedAt: string | null;
  /** A token was stored before sealing existed and should be sealed on the next write. */
  needsSealing: boolean;
  /** A token is sealed but no configured key opens it. */
  unreadable: boolean;
};

/* The ciphertext is bound to the row and the column it lives in. */
const context = (userId: string, column: "access_token" | "refresh_token") => `${GOOGLE_PROVIDER}:${column}:${userId}`;

async function readConnection(userId: string): Promise<Connection | null> {
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
  const row = (data as ConnectionRow | null) ?? null;
  if (!row) return null;

  const access = openSecret(row.access_token, context(userId, "access_token"));
  const refresh = openSecret(row.refresh_token, context(userId, "refresh_token"));
  const unreadable = access.state === "unreadable" || refresh.state === "unreadable";
  if (unreadable) {
    /* Wrong key, or none. Said once here; the connection reads as gone. */
    console.warn("A stored Google token cannot be opened with the configured key", { userId });
  }

  return {
    accessToken: access.value,
    refreshToken: refresh.value,
    expiresAt: row.expires_at,
    scopes: row.scopes ?? [],
    accountEmail: row.account_email,
    connectedAt: row.connected_at,
    needsSealing: (access.state === "plain" || refresh.state === "plain") && isSecretCipherConfigured(),
    unreadable,
  };
}

async function writeTokens(
  userId: string,
  tokens: { accessToken: string | null; refreshToken: string | null },
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("integration_connections")
    .update({
      access_token: tokens.accessToken ? sealSecret(tokens.accessToken, context(userId, "access_token")) : null,
      refresh_token: tokens.refreshToken ? sealSecret(tokens.refreshToken, context(userId, "refresh_token")) : null,
      ...extra,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", GOOGLE_PROVIDER);
  if (error) {
    console.error("Unable to update an integration connection", { code: error.code });
    return false;
  }
  return true;
}

/** What the Integrations page is allowed to know. */
export async function connectionStatus(userId: string): Promise<ConnectionStatus> {
  const connection = await readConnection(userId);
  if (!connection || connection.unreadable) return DISCONNECTED;
  if (!connection.refreshToken && !connection.accessToken) return DISCONNECTED;
  return {
    connected: true,
    accountEmail: connection.accountEmail,
    connectedAt: connection.connectedAt,
    driveGranted: grantsDriveAccess(connection.scopes),
  };
}

export async function saveGoogleConnection(input: {
  userId: string;
  tokens: GoogleTokens;
  accountEmail: string | null;
}): Promise<boolean> {
  /*
   * Fails closed. Without a key there is nowhere safe to put the grant, and
   * the connect route has already refused before this point; this is the
   * second refusal, for any path that reaches here another way.
   */
  if (!isSecretCipherConfigured()) {
    console.error("Refusing to store a Google grant: INTEGRATION_TOKEN_KEY is not configured");
    return false;
  }

  const existing = await readConnection(input.userId);
  /*
   * Google issues a refresh token on the first grant and, in some re-consent
   * paths, not again. Overwriting the stored one with null would turn a
   * working connection into one that dies within the hour, with nothing to
   * show for it — so an absent refresh token keeps whatever is already there.
   */
  const refreshToken = input.tokens.refreshToken ?? existing?.refreshToken ?? null;

  const { error } = await createAdminClient().from("integration_connections").upsert({
    user_id: input.userId,
    provider: GOOGLE_PROVIDER,
    access_token: sealSecret(input.tokens.accessToken, context(input.userId, "access_token")),
    refresh_token: refreshToken ? sealSecret(refreshToken, context(input.userId, "refresh_token")) : null,
    expires_at: input.tokens.expiresAt.toISOString(),
    scopes: input.tokens.scopes,
    account_email: input.accountEmail ?? existing?.accountEmail ?? null,
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

  const connection = await readConnection(userId);
  if (!connection || connection.unreadable) return null;

  /*
   * A row from before sealing existed is sealed the first time it is read
   * with a key present. Done here, on the path that already writes to the
   * row, so an existing deployment converges to ciphertext by itself.
   */
  if (connection.needsSealing) {
    await writeTokens(userId, { accessToken: connection.accessToken, refreshToken: connection.refreshToken });
  }

  if (connection.accessToken && !isExpired(connection.expiresAt)) return connection.accessToken;
  if (!connection.refreshToken) return null;

  try {
    const refreshed = await refreshAccessToken({
      refreshToken: connection.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      knownScopes: connection.scopes,
    });
    await writeTokens(
      userId,
      { accessToken: refreshed.accessToken, refreshToken: connection.refreshToken },
      { expires_at: refreshed.expiresAt.toISOString() },
    );
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
  const connection = await readConnection(userId);
  const token = connection?.refreshToken ?? connection?.accessToken;
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
