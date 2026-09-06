import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { canonicalJobUrl } from "@/lib/jobs/source-url";
import { scoreOpportunity } from "@/lib/matching/opportunity-score";

export const jobInputSchema = z.object({
  title: z.string().trim().min(2).max(240),
  employer: z.string().trim().max(240).optional().default(""),
  location: z.string().trim().max(240).optional().default(""),
  sourceUrl: z.union([z.literal(""), z.string().url().startsWith("https://").max(2000)]).optional().default(""),
  description: z.string().trim().min(120).max(80_000),
});

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = jobInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the role details and use a secure HTTPS source link." }, { status: 400 });

  const { title, employer, location, sourceUrl, description } = parsed.data;

  /*
   * Read against this user's own evidence. The matcher has no career of its
   * own to fall back on, which is the point — a role can only be judged
   * against skills the person has actually approved.
   */
  const { roles, evidence, lanes } = await getCareerWorkspace(supabase, user.id);
  const scored = scoreOpportunity(title, description, evidence, roles, lanes);

  /*
   * The same advert saved twice is one advert.
   *
   * This matters now that the browser extension makes saving one click from a
   * job board — one click is easy to do twice, and a pipeline holding the same
   * LinkedIn posting three times has stopped being a record of anything.
   *
   * Compared in JavaScript against this user's own rows rather than through a
   * stored canonical column, for one reason worth more than the tidiness: it
   * works on roles saved before this deploy. A new column would only ever
   * dedupe against rows written after it existed.
   */
  const canonical = canonicalJobUrl(sourceUrl);
  let existingId: string | null = null;
  if (canonical) {
    const { data: saved } = await supabase
      .from("jobs")
      .select("id,source_url")
      .eq("user_id", user.id)
      .not("source_url", "is", null);
    existingId = saved?.find((job) => canonicalJobUrl(job.source_url) === canonical)?.id ?? null;
  }

  /*
   * A role already in the pipeline is refreshed, never replaced. The status the
   * person set — applied, interview — is theirs and is left exactly alone; what
   * updates is the advert text and the score read from it, because the second
   * capture is the more recent reading of the same posting.
   */
  if (existingId) {
    const { data: updated, error: updateError } = await supabase
      .from("jobs")
      .update({
        employer: employer || null,
        title,
        location: location || null,
        raw_description: description,
        technical_heaviness: scored.evidenceBacking,
        overall_match: scored.overallMatch,
        recommendation: scored.recommendation,
        rule_analysis: scored.analysis,
      })
      .eq("id", existingId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("Unable to refresh an existing opportunity", updateError);
      return NextResponse.json({ error: "Sartho could not update this opportunity." }, { status: 500 });
    }
    return NextResponse.json({ job: updated, existing: true }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      source: sourceUrl ? "job-link" : "manual",
      source_url: sourceUrl || null,
      employer: employer || null,
      title,
      location: location || null,
      raw_description: description,
      status: "saved",
      // Honest state: the quick match is done, the grounded deep analysis is not
      // — the user runs that on demand from the opportunity page.
      deep_analysis_status: "not_started",
      technical_heaviness: scored.evidenceBacking,
      overall_match: scored.overallMatch,
      recommendation: scored.recommendation,
      rule_analysis: scored.analysis,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Unable to save opportunity", error);
    return NextResponse.json({ error: "Sartho could not save this opportunity." }, { status: 500 });
  }
  return NextResponse.json({ job: data, existing: false }, { status: 201 });
}
