import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { analyseJobDescription } from "@/lib/matching/analyse-job";

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    title?: string;
    employer?: string;
    location?: string;
    sourceUrl?: string;
    description?: string;
  } | null;

  const title = body?.title?.trim();
  const description = body?.description?.trim();
  if (!title || title.length < 2) {
    return NextResponse.json({ error: "Add the job title before saving." }, { status: 400 });
  }
  if (!description || description.length < 120) {
    return NextResponse.json({ error: "Paste a fuller job description before saving." }, { status: 400 });
  }

  const analysis = analyseJobDescription(description);
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      source: body?.sourceUrl ? "job-link" : "manual",
      source_url: body?.sourceUrl?.trim() || null,
      employer: body?.employer?.trim() || null,
      title,
      location: body?.location?.trim() || null,
      raw_description: description,
      status: "saved",
      technical_heaviness: analysis.technicalHeaviness,
      recommendation: analysis.recommendation,
      rule_analysis: analysis,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ job: data }, { status: 201 });
}
