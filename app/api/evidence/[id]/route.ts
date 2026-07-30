import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import type { ApprovalStatus } from "@/lib/types";

const allowedStatuses = new Set<ApprovalStatus>(["pending", "approved", "rejected"]);

type EvidencePatch = {
  approval_status?: ApprovalStatus;
  claim?: string;
  context?: string | null;
  safe_for_resume?: boolean;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as EvidencePatch | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const update: EvidencePatch = {};

  if (body.approval_status !== undefined) {
    if (!allowedStatuses.has(body.approval_status)) {
      return NextResponse.json({ error: "Invalid approval status" }, { status: 400 });
    }
    update.approval_status = body.approval_status;
    update.safe_for_resume = body.approval_status === "approved";
  }

  if (body.claim !== undefined) {
    const claim = body.claim.trim();
    if (claim.length < 10) {
      return NextResponse.json({ error: "The evidence claim is too short." }, { status: 400 });
    }
    update.claim = claim;
  }

  if (body.context !== undefined) update.context = body.context?.trim() || null;
  if (body.safe_for_resume !== undefined) update.safe_for_resume = body.safe_for_resume;

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "No supported changes supplied" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("evidence_items")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ evidence: data });
}
