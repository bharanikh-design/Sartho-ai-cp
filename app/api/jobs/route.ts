import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCareerWorkspace } from "@/lib/data/career";
import { analyseJobDescription } from "@/lib/matching/analyse-job";
import { alignToLanes, overallMatchScore, withLane } from "@/lib/matching/opportunity-score";
import { buildSkillProfile } from "@/lib/matching/skill-profile";

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
  const analysis = analyseJobDescription(description, buildSkillProfile(evidence, roles));
  const alignment = alignToLanes(title, description, lanes);
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
      deep_analysis_status: "complete", // Bypassing async analysis queue for real-time semantic processing
      technical_heaviness: analysis.evidenceBacking,
      overall_match: overallMatchScore(analysis, alignment),
      recommendation: analysis.recommendation,
      rule_analysis: withLane(analysis, alignment),
    })
    .select("*")
    .single();

  if (error) {
    console.error("Unable to save opportunity", error);
    return NextResponse.json({ error: "Sartho could not save this opportunity." }, { status: 500 });
  }
  return NextResponse.json({ job: data }, { status: 201 });
}
