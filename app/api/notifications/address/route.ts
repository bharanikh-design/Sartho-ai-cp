import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { loadNotificationAddress, setNotificationAddress } from "@/lib/notifications/address";
import { describeAddressOutcome, summariseAddress } from "@/lib/notifications/address-response";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Where the emails go.
 *
 * The account's own sign-in address is accepted at once. Any other address
 * is written as waiting and sent a confirmation link, and nothing goes to it
 * until that link is used: a signed-in person can ask Sartho to email an
 * address, but only the person reading that inbox can say yes.
 */

export const runtime = "nodejs";

const schema = z.object({ email: z.string().trim().email().max(320) });

export async function PUT(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Sartho cannot save addresses right now." }, { status: 503 });
  }

  const outcome = await setNotificationAddress(admin, { userId: user.id, accountEmail: user.email, requested: parsed.data.email });
  const address = summariseAddress(await loadNotificationAddress(admin, user.id));
  const { status, error, code } = describeAddressOutcome(outcome);
  return NextResponse.json({ ...outcome, ...(error ? { error, code } : {}), address }, { status });
}
