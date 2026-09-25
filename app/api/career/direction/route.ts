import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { propagateCandidateMutation } from "@/lib/workflow/propagate-candidate-mutation";

import { directionSchema } from "./schema";

export async function PUT(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const parsed = directionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the career direction fields." }, { status: 400 });

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Sartho user",
    headline: parsed.data.headline || null,
    summary: parsed.data.summary || null,
    location: parsed.data.location || null,
    work_authorisation: parsed.data.workAuthorisation || null,
    strengths: parsed.data.strengths,
  });
  if (profileError) {
    logError(supabase, "direction_save_profile", profileError);
    return NextResponse.json({ error: "Sartho could not save your career profile." }, { status: 500 });
  }

  /*
   * Never delete the working strategy before the replacement is safely stored.
   * New and retained lanes are upserted first. Removed lanes are then disabled
   * before best-effort cleanup, so a cleanup failure cannot corrupt allocation.
   */
  const { data: existing, error: existingError } = await supabase
    .from("target_lanes")
    .select("id,name")
    .eq("user_id", user.id);
  if (existingError) {
    logError(supabase, "direction_read_targets", existingError);
    return NextResponse.json({ error: "Sartho could not update your target profiles." }, { status: 500 });
  }

  const laneRows = parsed.data.lanes.map((lane, index) => ({
    user_id: user.id,
    name: lane.name,
    weight: lane.weight,
    priority: index + 1,
    active: lane.active,
  }));

  if (laneRows.length) {
    const { error: lanesError } = await supabase
      .from("target_lanes")
      .upsert(laneRows, { onConflict: "user_id,name" });
    if (lanesError) {
      logError(supabase, "direction_save_targets", lanesError);
      return NextResponse.json({ error: "Sartho could not save your target profiles." }, { status: 500 });
    }
  }

  const retainedNames = new Set(laneRows.map((lane) => lane.name));
  const staleIds = (existing ?? []).filter((lane) => !retainedNames.has(lane.name)).map((lane) => lane.id);
  if (staleIds.length) {
    const { error: disableError } = await supabase
      .from("target_lanes")
      .update({ active: false, weight: 0 })
      .eq("user_id", user.id)
      .in("id", staleIds);
    if (disableError) {
      logError(supabase, "direction_disable_targets", disableError);
      return NextResponse.json({ error: "Sartho preserved your previous strategy because the update could not finish." }, { status: 500 });
    }

    const { error: cleanupError } = await supabase
      .from("target_lanes")
      .delete()
      .eq("user_id", user.id)
      .in("id", staleIds);
    if (cleanupError) console.warn("Removed target profiles remain disabled", cleanupError);
  }

  // Priorities feed the opportunity score, so a change here re-ranks every
  // saved role against the direction the user just set.
  await propagateCandidateMutation(supabase, user.id, "career_direction");

  return NextResponse.json({ ok: true });
}
