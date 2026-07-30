import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/welcome";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/welcome";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  const errorUrl = new URL("/login", url.origin);
  errorUrl.searchParams.set("error", "We could not complete sign-in. Please try again.");
  return NextResponse.redirect(errorUrl);
}
