import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

const evidencePatchSchema = z.object({
  approval_status: z.enum(["pending", "approved", "rejected"]).optional(),
  claim: z.string().trim().min(10).max(4000).optional(),
  context: z.string().trim().max(8000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No supported changes supplied");

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Evidence record not found." }, { status: 404 });
  const parsed = evidencePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the evidence change." }, { status: 400 });

  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.approval_status !== undefined) {
    update.safe_for_resume = parsed.data.approval_status === "approved";
  }
  if (parsed.data.context !== undefined) update.context = parsed.data.context || null;

  const { data, error } = await supabase
    .from("evidence_items")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Unable to update evidence", error);
    return NextResponse.json({ error: "Sartho could not save this evidence change." }, { status: 500 });
  }
  // Missing or owned by someone else — indistinguishable under RLS, and a 404
  // either way rather than the 500 that `.single()` produced on an empty result.
  if (!data) return NextResponse.json({ error: "Evidence record not found." }, { status: 404 });
  return NextResponse.json({ evidence: data });
}
