import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

/*
 * One uploaded résumé: read it back, or make it the master.
 *
 * The list on Résumé Studio is built without the document text — a list has
 * no business dragging every résumé across the wire — so the text is fetched
 * here when somebody opens a row. What comes back is the column as stored:
 * the file's text exactly as it was read, with nothing tidied or shortened.
 */

export const runtime = "nodejs";

/*
 * The column and the function this uses arrive by a migration run by hand.
 * Saying so beats a 500 that reads as a fault in the code.
 */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "PGRST202" || error.code === "42703" || error.code === "42883") return true;
  const message = (error.message ?? "").toLowerCase();
  return (message.includes("column") || message.includes("function")) && (message.includes("does not exist") || message.includes("could not find"));
}

const MIGRATION_HINT =
  "This deployment is missing the résumé originals schema. The administrator needs to run the 20260920090000_resume_upload_originals migration.";

const idSchema = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "That résumé is not available." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("resume_imports")
    .select("id,file_name,extracted_text,character_count")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Could not read the uploaded résumé", error);
    return NextResponse.json({ error: "Sartho could not read that résumé." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "That résumé is not available." }, { status: 404 });

  const text = (data.extracted_text as string | null) ?? "";
  return NextResponse.json({
    id: data.id,
    fileName: data.file_name,
    text,
    /* The stored count, and the length of what was actually returned, so a mismatch is visible. */
    characterCount: data.character_count,
    returnedCharacters: text.length,
  });
}

const patchSchema = z.object({ isMaster: z.literal(true) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "That résumé is not available." }, { status: 404 });
  }

  /*
   * Only "make this the master" is accepted. Un-mastering is not a thing: the
   * way to stop a résumé being the master is to choose another one, so there
   * is always exactly one, or none until the first is chosen.
   */
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That change is not valid." }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_master_resume_import", { p_import_id: id });
  if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
  if (error) {
    const message = (error.message ?? "").toLowerCase();
    if (message.includes("not found") || message.includes("access denied")) {
      return NextResponse.json({ error: "That résumé is not available." }, { status: 404 });
    }
    console.error("Could not mark the master résumé", error);
    return NextResponse.json({ error: "Sartho could not mark that résumé as your master." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, isMaster: true });
}
