import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import type { JobStatus } from "@/lib/types";

const allowedStatuses = new Set<JobStatus>([
  "saved",
  "analysed",
  "approved",
  "applied",
  "acknowledged",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as { status?: JobStatus } | null;
  if (!body?.status || !allowedStatuses.has(body.status)) {
    return NextResponse.json({ error: "Invalid job status" }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .update({ status: body.status })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (jobError) {
    console.error("Unable to update opportunity", jobError);
    return NextResponse.json({ error: "Sartho could not update this opportunity." }, { status: 500 });
  }

  /*
   * No row matched: the opportunity does not exist, or it belongs to someone
   * else. Row Level Security makes those two indistinguishable from here,
   * which is deliberate — telling them apart would confirm the existence of
   * another user's record. Either way it is a 404.
   *
   * `.single()` used to sit here and raised PGRST116 on an empty result, so
   * every miss surfaced as "Sartho could not update this opportunity" on a
   * 500 — a server fault reported for a client mistake.
   */
  if (!job) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  if (body.status !== "saved") {
    const { error: applicationError } = await supabase
      .from("applications")
      .upsert(
        {
          user_id: user.id,
          job_id: id,
          status: body.status,
        },
        { onConflict: "user_id,job_id" },
      );

    if (applicationError) {
      console.error("Unable to update application ledger", applicationError);
      return NextResponse.json({ error: "The opportunity was saved, but its application record could not be updated." }, { status: 500 });
    }
  }

  return NextResponse.json({ job });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Unable to remove opportunity", error);
    return NextResponse.json({ error: "Sartho could not remove this opportunity." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
