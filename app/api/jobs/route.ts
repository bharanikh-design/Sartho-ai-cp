import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
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
  return NextResponse.json({ job: data }, { status: 201 });
}
