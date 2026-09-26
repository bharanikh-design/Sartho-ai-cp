import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { isCalendarDay, normaliseNextAction } from "@/lib/applications/next-action";
import type { JobStatus } from "@/lib/types";

/*
 * Recording what you said you would do next on an application.
 *
 * `applications.next_action` and `next_action_date` have existed since the
 * initial schema. The Command Centre reads them — `buildCareerCommandCentre`
 * makes the first application carrying a next action its headline follow-up —
 * and nothing in the product could ever set one. The only mention of the
 * column in a write was the Résumé Studio sending `next_action: null`. So the
 * follow-up action was unreachable by construction: the dashboard offered a
 * generic "Review N active applications" forever, because the specific thing
 * it wanted to say could not be stored.
 *
 * This is deliberately its own route rather than another field on the status
 * PATCH. That handler carries the outcome state machine — which stage an
 * ending is recorded against, when a reason is cleared — and a note about
 * next week's follow-up call has no business being routed through it.
 */

export const runtime = "nodejs";

const schema = z.object({
  /* Empty clears it, which is how a completed follow-up gets put away. */
  nextAction: z.string().trim().max(200).nullable(),
  /* A `date` column, so a plain calendar day with no timezone. */
  nextActionDate: z.string().refine(isCalendarDay, "Not a real date.").nullable(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That next action could not be saved." }, { status: 400 });
  }

  /*
   * Doubles as the ownership check: no row means it does not exist or belongs
   * to somebody else, indistinguishable under Row Level Security and a 404
   * either way. The status comes back so a first insert into `applications`
   * agrees with the opportunity rather than defaulting to 'saved' underneath
   * a role that is already at interview.
   */
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (jobError) {
    console.error("Unable to read opportunity", jobError);
    return NextResponse.json({ error: "Sartho could not save that next action." }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  const { nextAction, nextActionDate } = normaliseNextAction(
    parsed.data.nextAction,
    parsed.data.nextActionDate,
  );

  const { error: saveError } = await supabase
    .from("applications")
    .upsert(
      {
        user_id: user.id,
        job_id: id,
        status: job.status as JobStatus,
        next_action: nextAction,
        next_action_date: nextActionDate,
      },
      { onConflict: "user_id,job_id" },
    );

  if (saveError) {
    console.error("Unable to save next action", saveError);
    return NextResponse.json({ error: "Sartho could not save that next action." }, { status: 500 });
  }

  return NextResponse.json({ nextAction, nextActionDate });
}
