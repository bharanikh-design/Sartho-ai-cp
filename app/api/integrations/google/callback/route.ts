import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  exchangeCodeForTokens,
  fetchAccountEmail,
  googleOAuthConfig,
  googleRedirectUri,
  grantsDriveAccess,
} from "@/lib/integrations/google";
import { readState } from "@/lib/integrations/state";
import { saveGoogleConnection } from "@/lib/integrations/store";

/*
 * Where Google sends somebody back to.
 *
 * Two checks matter here more than anything else in this feature, and they are
 * both about the same attack. Anybody can send a signed-in Sartho user to this
 * URL with a `code` from their *own* Google account. Without the state check,
 * Sartho would attach the attacker's Drive to the victim's profile — and the
 * victim would then import a résumé the attacker controls.
 *
 *   1. The state must carry this server's signature.
 *   2. The user it was minted for must be the user holding the session now.
 *
 * Either failing means the flow is thrown away. Nothing here says which check
 * failed: one useful response covers all of them, and explaining the
 * difference only helps somebody probing the format.
 */
export const runtime = "nodejs";

const done = (request: Request, params: string) =>
  NextResponse.redirect(new URL(`/integrations?${params}`, request.url));

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const config = googleOAuthConfig();
  if (!config) return done(request, "error=not_configured");

  const url = new URL(request.url);

  /*
   * Somebody clicking Cancel on the consent screen is not an error. Google
   * sends them back with `error=access_denied`, and telling them something
   * went wrong when they deliberately declined would be a lie.
   */
  const denied = url.searchParams.get("error");
  if (denied) return done(request, denied === "access_denied" ? "cancelled=1" : "error=denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return done(request, "error=invalid");

  const mintedFor = readState(state, config.clientSecret);
  if (!mintedFor || mintedFor !== user.id) return done(request, "error=invalid");

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      /* Identical to the one sent at the start, or Google rejects the exchange. */
      redirectUri: googleRedirectUri(url.origin),
    });

    const accountEmail = await fetchAccountEmail(tokens.accessToken);
    const saved = await saveGoogleConnection({ userId: user.id, tokens, accountEmail });
    if (!saved) return done(request, "error=save_failed");

    /*
     * Connected, but Drive may still have been unticked on the consent screen.
     * Saying so now is the difference between a person reconnecting in ten
     * seconds and discovering a 403 the next time they look for a résumé.
     */
    return done(request, grantsDriveAccess(tokens.scopes) ? "connected=1" : "error=no_drive");
  } catch (caught) {
    console.error("Google OAuth exchange failed", {
      message: caught instanceof Error ? caught.message : "unknown",
    });
    return done(request, "error=exchange_failed");
  }
}
