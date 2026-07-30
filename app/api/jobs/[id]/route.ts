import { NextResponse } from "next/server";
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
    .single();

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 400 });

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
      return NextResponse.json({ error: applicationError.message }, { status: 400 });
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
  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
