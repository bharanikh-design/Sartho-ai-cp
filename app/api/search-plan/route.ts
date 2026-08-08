import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

const schema = z.object({
  targetLocations: z.array(z.string().trim().min(1).max(120)).max(20),
  remotePreference: z.enum(["On-site", "Hybrid", "Remote", "Flexible"]),
  sources: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(180), url: z.string().url().startsWith("https://"), type: z.string().max(100), coverage: z.string().max(100), trust: z.string().max(100), active: z.boolean() })).max(40),
});

export async function PUT(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the search plan fields." }, { status: 400 });
  const { error } = await supabase.from("search_preferences").upsert({ user_id: user.id, target_locations: parsed.data.targetLocations, remote_preference: parsed.data.remotePreference, sources: parsed.data.sources, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
