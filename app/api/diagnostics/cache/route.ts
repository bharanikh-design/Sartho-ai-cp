import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Whether the shared advert cache is actually filling.
 *
 * The store swallows every failure on purpose: a cache that can take search
 * down is a liability, so a missing table, a missing service-role key and a
 * refused write all degrade silently to "no cache". That is the right
 * behaviour for a search and a terrible one for a person trying to find out
 * why nothing is being cached, because all three look identical from outside —
 * which is the exact shape of problem that has cost this project days.
 *
 * So the silence is broken here, in one place, where somebody is asking.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperationsAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  /*
   * Read as the person, exactly as the search does, so a broken RLS policy
   * shows up here rather than only in production.
   */
  const readCheck = await supabase
    .from("job_search_cache")
    .select("signature,collected_at,serpapi_search_id,submitted_at")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (readCheck.error) {
    return NextResponse.json({
      table: "missing or unreadable",
      detail: readCheck.error.message,
      fix: "Run supabase/migrations/20260913040000_job_search_cache.sql in the SQL editor. Until it exists the cache reads as empty and search works exactly as it did before.",
      checkedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  }

  const rows = readCheck.data ?? [];
  const collected = rows.filter((row) => row.collected_at).length;
  const outstanding = rows.filter((row) => row.serpapi_search_id && !row.collected_at).length;

  /*
   * The write path, which is the half that fails silently. Reading proves the
   * table and the policy; only a write proves the service-role key, and a
   * deployment missing it fills the cache with nothing forever while looking
   * perfectly healthy.
   */
  let writable: boolean;
  let writeDetail: string | null = null;
  const probe = `__diagnostic__|${Date.now()}`;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("job_search_cache").upsert({
      signature: probe,
      listings: [],
      updated_at: new Date().toISOString(),
    }, { onConflict: "signature" });
    if (error) throw new Error(error.message);
    writable = true;
    /* Removed again: a probe row must never be mistaken for a cached advert. */
    await admin.from("job_search_cache").delete().eq("signature", probe);
  } catch (caught) {
    writable = false;
    writeDetail = caught instanceof Error ? caught.message : "unknown error";
  }

  return NextResponse.json({
    table: "present",
    writable,
    writeDetail,
    fix: writable
      ? null
      : "Set SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy. Without it the cache reads perfectly well and never fills, so every search pays full price forever.",
    rowsSampled: rows.length,
    withAnswers: collected,
    awaitingCollection: outstanding,
    note: rows.length === 0
      ? "Nothing cached yet. A search files a ticket per deep query; the next search collects those for free."
      : `${collected} of the ${rows.length} most recent rows hold answers, ${outstanding} are tickets waiting to be collected.`,
    recent: rows.slice(0, 10).map((row) => ({
      signature: row.signature,
      state: row.collected_at ? "answered" : row.serpapi_search_id ? "awaiting collection" : "empty",
      collectedAt: row.collected_at,
      submittedAt: row.submitted_at,
    })),
    checkedAt: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
