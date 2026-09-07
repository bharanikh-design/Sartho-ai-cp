import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { googleAuthUrl, googleOAuthConfig, googleRedirectUri } from "@/lib/integrations/google";
import { mintState } from "@/lib/integrations/state";

/*
 * Start the Google consent flow.
 *
 * A GET that redirects, because it is reached by clicking a link — not a POST,
 * which would need a form and a page transition to do the same thing.
 *
 * The origin comes from the request rather than a configured constant on
 * purpose: Sartho runs on a preview deployment, on localhost and on
 * sartho.tech, and the redirect_uri sent here must be byte-identical to the
 * one Google is about to compare it against. Hard-coding it would make the
 * flow work in exactly one of those three places.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const config = googleOAuthConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/integrations?error=not_configured", request.url));
  }

  const origin = new URL(request.url).origin;
  /*
   * The client secret doubles as the signing key. It is present exactly when
   * this flow can run, it never leaves the server, and it saves inventing a
   * second secret that somebody has to remember to set.
   */
  const state = mintState(user.id, config.clientSecret);

  return NextResponse.redirect(googleAuthUrl({
    clientId: config.clientId,
    redirectUri: googleRedirectUri(origin),
    state,
  }));
}
