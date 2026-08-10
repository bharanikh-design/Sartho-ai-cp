import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  deriveOutcomeStage,
  isTerminalOutcome,
  OUTCOME_REASONS,
  type OutcomeStage,
} from "@/lib/applications/outcome";
import type { JobStatus } from "@/lib/types";

const JOB_STATUSES = [
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
] as const satisfies readonly JobStatus[];

/*
 * A status change may carry the reason an application ended. The reason and
 * note are only meaningful when the new status is a terminal outcome, and are
 * ignored otherwise rather than rejected — the client should not have to know
 * that rule to move a role back into the pipeline.
 */
const patchSchema = z.object({
  status: z.enum(JOB_STATUSES),
  outcomeReason: z.enum(OUTCOME_REASONS).optional(),
  outcomeNote: z.string().trim().max(2000).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid job status" }, { status: 400 });
  const { status, outcomeReason, outcomeNote } = parsed.data;

  /*
   * The stage an ending is recorded against is the one the role held *before*
   * this change, so the previous status is read before the update overwrites
   * it. This read also serves as the ownership check: no row means the
   * opportunity does not exist or belongs to someone else — indistinguishable
   * under Row Level Security, and a 404 either way.
   */
  const { data: current, error: currentError } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentError) {
    console.error("Unable to read opportunity", currentError);
    return NextResponse.json({ error: "Sartho could not update this opportunity." }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (jobError || !job) {
    console.error("Unable to update opportunity", jobError);
    return NextResponse.json({ error: "Sartho could not update this opportunity." }, { status: 500 });
  }

  if (status !== "saved") {
    /*
     * Entering a terminal status records why it ended; any other move clears a
     * previously recorded outcome, so correcting a mistaken "rejected" back to
     * "interview" does not leave a stale reason behind it.
     */
    let outcome: {
      outcome_stage: OutcomeStage | null;
      outcome_reason: string | null;
      outcome_note: string | null;
      outcome_recorded_at: string | null;
    };
    if (isTerminalOutcome(status)) {
      let stage = deriveOutcomeStage(current.status as JobStatus);
      /*
       * A null stage means the previous status was itself terminal — this is an
       * edit to an already-recorded outcome, or a switch between rejected and
       * withdrawn. The stage the application actually reached is on the existing
       * row, so it is kept rather than overwritten with the null the derivation
       * (correctly) returns.
       */
      if (stage === null) {
        const { data: existing } = await supabase
          .from("applications")
          .select("outcome_stage")
          .eq("user_id", user.id)
          .eq("job_id", id)
          .maybeSingle();
        stage = (existing?.outcome_stage as OutcomeStage | null) ?? null;
      }
      outcome = {
        outcome_stage: stage,
        outcome_reason: outcomeReason ?? null,
        outcome_note: outcomeNote || null,
        outcome_recorded_at: new Date().toISOString(),
      };
    } else {
      outcome = {
        outcome_stage: null,
        outcome_reason: null,
        outcome_note: null,
        outcome_recorded_at: null,
      };
    }

    const { error: applicationError } = await supabase
      .from("applications")
      .upsert(
        { user_id: user.id, job_id: id, status, ...outcome },
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
