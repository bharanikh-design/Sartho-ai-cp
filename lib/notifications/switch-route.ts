import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { setNotificationSwitch } from "@/lib/notifications/address";
import { summariseAddress } from "@/lib/notifications/address-response";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * One switch, saved.
 *
 * Shared by the two preference routes, which used to take an address
 * alongside the switch and write it as typed. The address now has its own
 * route and its own confirmation, and a body that still carries one is
 * ignored rather than honoured: the schema keeps `enabled` and drops the rest.
 */

const schema = z.object({ enabled: z.boolean() });

export async function saveSwitch(
  request: Request,
  column: "daily_digest_enabled" | "match_alerts_enabled",
): Promise<NextResponse> {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say whether this email is on or off." }, { status: 400 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Sartho cannot save preferences right now." }, { status: 503 });
  }

  const result = await setNotificationSwitch(admin, { userId: user.id, accountEmail: user.email, column, enabled: parsed.data.enabled });
  if (!result.ok) {
    if (result.reason === "no_address") {
      return NextResponse.json({ error: "Add an email address first.", code: "no_address" }, { status: 409 });
    }
    return NextResponse.json({ error: "Sartho could not save your preference." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, address: summariseAddress(result.address) });
}
