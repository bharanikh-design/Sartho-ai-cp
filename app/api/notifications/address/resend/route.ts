import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { loadNotificationAddress, resendConfirmation } from "@/lib/notifications/address";
import { describeAddressOutcome, summariseAddress } from "@/lib/notifications/address-response";
import { createAdminClient } from "@/lib/supabase/admin";

/* Another link for the address that is waiting, on the same cooldown as the first. */

export const runtime = "nodejs";

export async function POST() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Sartho cannot send a link right now." }, { status: 503 });
  }

  const outcome = await resendConfirmation(admin, { userId: user.id });
  const address = summariseAddress(await loadNotificationAddress(admin, user.id));
  const { status, error, code } = describeAddressOutcome(outcome);
  return NextResponse.json({ ...outcome, ...(error ? { error, code } : {}), address }, { status });
}
