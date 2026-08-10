import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

const preferenceSchema = z.object({
  email: z.string().trim().email().max(320),
  enabled: z.boolean(),
});

export async function PUT(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid notification email address." }, { status: 400 });

  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: user.id,
    email: parsed.data.email,
    daily_digest_enabled: parsed.data.enabled,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Unable to save notification preference", { code: error.code });
    return NextResponse.json({ error: "Sartho could not save your notification preference." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
