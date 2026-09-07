import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { disconnectGoogle } from "@/lib/integrations/store";

/*
 * A POST, not a GET, and deliberately so: a GET that revokes somebody's Google
 * grant can be fired by an image tag on any page on the internet.
 */
export const runtime = "nodejs";

export async function POST() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const removed = await disconnectGoogle(user.id);
  if (!removed) {
    return NextResponse.json({ error: "Sartho could not disconnect that account." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
