import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function safeMessage(value: string | null, fallback: string) {
  return (value || fallback).replace(/[\r\n]+/g, " ").slice(0, 500);
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

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const message = safeMessage(error.message, "Supabase could not create the signed-in session.");
  console.error("Sartho OAuth session exchange failed", {
    name: error.name,
    status: error.status,
    message,
  });

  const errorUrl = new URL("/login", url.origin);
  errorUrl.searchParams.set("error", message);
  errorUrl.searchParams.set("error_code", error.name || "session_exchange_failed");
  return NextResponse.redirect(errorUrl);
}
