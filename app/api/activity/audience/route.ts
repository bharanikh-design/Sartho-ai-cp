import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEW_VISIT_GAP_SECONDS } from "@/lib/analytics/activity";

const schema = z.object({
  visitorId: z.string().uuid(),
  path: z.string().trim().min(1).max(500),
  referrerHost: z.string().trim().max(255).nullable().optional(),
});

function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return (error.message ?? "").toLowerCase().includes("anonymous_visitors");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  const { user } = await getAuthenticatedUser();
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // Telemetry must never interfere with a product request.
    return new NextResponse(null, { status: 204 });
  }

  const now = new Date();
  const { data: existing, error: readError } = await admin
    .from("anonymous_visitors")
    .select("first_seen_at,last_seen_at,visit_count,page_view_count,converted_user_id,referrer_host")
    .eq("visitor_id", parsed.data.visitorId)
    .maybeSingle();

  if (missingTable(readError)) return new NextResponse(null, { status: 204 });
  if (readError && readError.code !== "PGRST116") {
    console.warn("Unable to read anonymous audience telemetry", { code: readError.code });
    return new NextResponse(null, { status: 204 });
  }

  const lastSeen = existing?.last_seen_at ? new Date(existing.last_seen_at).getTime() : NaN;
  const returning = Number.isFinite(lastSeen)
    && now.getTime() - lastSeen > NEW_VISIT_GAP_SECONDS * 1000;

  const payload = {
    visitor_id: parsed.data.visitorId,
    first_seen_at: existing?.first_seen_at ?? now.toISOString(),
    last_seen_at: now.toISOString(),
    visit_count: Math.max(1, Number(existing?.visit_count ?? 1)) + (returning ? 1 : 0),
    page_view_count: Math.max(0, Number(existing?.page_view_count ?? 0)) + 1,
    first_path: existing ? undefined : parsed.data.path,
    last_path: parsed.data.path,
    referrer_host: existing?.referrer_host ?? parsed.data.referrerHost ?? null,
    ...(user && !existing?.converted_user_id
      ? { converted_user_id: user.id, converted_at: now.toISOString() }
      : {}),
    updated_at: now.toISOString(),
  };

  const { error } = await admin.from("anonymous_visitors").upsert(payload);
  if (!missingTable(error) && error) {
    console.warn("Unable to record anonymous audience telemetry", { code: error.code });
  }

  return new NextResponse(null, { status: 204 });
}


export async function DELETE(request: Request) {
  const parsed = z.object({ visitorId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { error } = await admin
    .from("anonymous_visitors")
    .delete()
    .eq("visitor_id", parsed.data.visitorId);

  if (!missingTable(error) && error) {
    console.warn("Unable to revoke anonymous audience telemetry", { code: error.code });
  }
  return new NextResponse(null, { status: 204 });
}
