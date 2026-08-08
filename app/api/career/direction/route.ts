import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

const directionSchema = z.object({
  headline: z.string().trim().max(240),
  summary: z.string().trim().max(4000),
  location: z.string().trim().max(160),
  workAuthorisation: z.string().trim().max(1000),
  strengths: z.array(z.string().trim().min(1).max(120)).max(30),
  lanes: z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(180), weight: z.number().int().min(0).max(100), active: z.boolean() })).max(20),
});

export async function PUT(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const parsed = directionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the career direction fields." }, { status: 400 });

  const activeTotal = parsed.data.lanes.filter((lane) => lane.active).reduce((sum, lane) => sum + lane.weight, 0);
  if (activeTotal !== 100) return NextResponse.json({ error: "Active profile priorities must total 100%." }, { status: 400 });

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Sartho user",
    headline: parsed.data.headline || null,
    summary: parsed.data.summary || null,
    location: parsed.data.location || null,
    work_authorisation: parsed.data.workAuthorisation || null,
    strengths: parsed.data.strengths,
  });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { error: deleteError } = await supabase.from("target_lanes").delete().eq("user_id", user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (parsed.data.lanes.length) {
    const { error: lanesError } = await supabase.from("target_lanes").insert(parsed.data.lanes.map((lane, index) => ({ user_id: user.id, name: lane.name, weight: lane.weight, priority: index + 1, active: lane.active })));
    if (lanesError) return NextResponse.json({ error: lanesError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
