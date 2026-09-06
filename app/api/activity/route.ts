import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { accrueActivity, type ActivitySnapshot } from "@/lib/analytics/activity";

/*
 * The heartbeat. One row per person, read then written.
 *
 * Deliberately takes no body. The browser reports that it is here; the server
 * decides what that is worth by comparing against the row it already holds.
 * Letting the client send a duration would make the number something a page
 * asserts rather than something the server observed, and the first person to
 * open developer tools could claim a nine-hour session.
 *
 * A signed-out caller gets a quiet 204 rather than a 401. The heartbeat runs in
 * the shell and a session can expire under it at any moment; that is ordinary,
 * not an error worth logging or showing anybody.
 */

export const runtime = "nodejs";

export async function POST() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return new NextResponse(null, { status: 204 });

  const { data: existing, error: readError } = await supabase
    .from("user_activity")
    .select("first_seen_at,last_seen_at,active_seconds,visit_count")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError && readError.code !== "PGRST116") {
    console.error("Unable to read activity", { code: readError.code });
    return new NextResponse(null, { status: 204 });
  }

  const previous: ActivitySnapshot | null = existing
    ? {
      firstSeenAt: String(existing.first_seen_at ?? ""),
      lastSeenAt: String(existing.last_seen_at ?? ""),
      activeSeconds: Number(existing.active_seconds ?? 0),
      visitCount: Number(existing.visit_count ?? 0),
    }
    : null;

  const next = accrueActivity(previous, new Date());

  const { error: writeError } = await supabase.from("user_activity").upsert({
    user_id: user.id,
    first_seen_at: next.firstSeenAt,
    last_seen_at: next.lastSeenAt,
    active_seconds: next.activeSeconds,
    visit_count: next.visitCount,
    updated_at: new Date().toISOString(),
  });

  /*
   * A failed heartbeat is never surfaced. Nothing a person is doing depends on
   * it, and an error toast about analytics would be an interruption in service
   * of nobody.
   */
  if (writeError) console.error("Unable to record activity", { code: writeError.code });

  return new NextResponse(null, { status: 204 });
}
