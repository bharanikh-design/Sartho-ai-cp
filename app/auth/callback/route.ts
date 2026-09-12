import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeMessage(value: string | null, fallback: string) {
  return (value || fallback).replace(/[\r\n]+/g, " ").slice(0, 500);
}

/*
 * The one failure here that is a configuration fault rather than a user fault.
 *
 * Supabase's own text for it ("PKCE code verifier not found in storage... use
 * @supabase/ssr on both the server and client") sends the reader after a bug
 * that is not there — this app has used @supabase/ssr on both sides all along.
 * What it actually means is that the verifier cookie was written on a different
 * host from the one serving this request: a sign-in begun on www.sartho.tech
 * and finished on sartho.tech, or begun on a preview deployment. Saying so,
 * with the host that answered, is the difference between a five-minute fix and
 * an afternoon spent re-checking Google credentials that were never wrong.
 */
function isMissingCodeVerifier(message: string) {
  const value = message.toLowerCase();
  return value.includes("code verifier") || value.includes("code_verifier");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const errorCode = url.searchParams.get("error_code");
  const requestedNext = url.searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (providerError) {
    const message = safeMessage(providerError, "Google sign-in was rejected by the authentication provider.");
    console.error("Sartho OAuth provider error", { errorCode, message });

    const errorUrl = new URL("/login", url.origin);
    errorUrl.searchParams.set("error", message);
    if (errorCode) errorUrl.searchParams.set("error_code", errorCode);
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    const message = "Google did not return an authorization code.";
    console.error("Sartho OAuth callback missing code");

    const errorUrl = new URL("/login", url.origin);
    errorUrl.searchParams.set("error", message);
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const rawMessage = safeMessage(error.message, "Supabase could not create the signed-in session.");
  const verifierMissing = isMissingCodeVerifier(rawMessage);
  const message = verifierMissing
    ? `This sign-in started on a different address than it finished on, so ${url.host} never received the one-time proof the browser stored. Start again from ${url.host} and it will complete.`
    : rawMessage;

  console.error("Sartho OAuth session exchange failed", {
    name: error.name,
    status: error.status,
    message: rawMessage,
    // The host is the diagnosis when the verifier is missing: compare it with
    // the origin the user pressed the button on and with Supabase's Site URL.
    callbackHost: url.host,
    verifierMissing,
  });

  const errorUrl = new URL("/login", url.origin);
  errorUrl.searchParams.set("error", message);
  errorUrl.searchParams.set(
    "error_code",
    verifierMissing ? "auth_origin_mismatch" : error.name || "session_exchange_failed",
  );
  return NextResponse.redirect(errorUrl);
}
