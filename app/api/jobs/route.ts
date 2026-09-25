import { NextResponse } from "next/server";
import { z } from "zod";
import { jobInputSchema } from "./schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { canonicalJobUrl } from "@/lib/jobs/source-url";
import { evaluateOpportunity, prepareCareerConductor } from "@/lib/workflow/career-conductor";
import { assessSemanticJobs } from "@/lib/context/job-context";
import { createSafetyIdentifier } from "@/lib/ai/provider";


export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = jobInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the role details and use a secure HTTPS source link." }, { status: 400 });

  const {
    title,
    employer,
    location,
    sourceUrl,
    description,
    semanticContext,
    semanticFit,
    semanticContextFingerprint,
  } = parsed.data;

  /*
   * Read against this user's own evidence. The matcher has no career of its
   * own to fall back on, which is the point — a role can only be judged
   * against skills the person has actually approved.
   */
  const conductor = await prepareCareerConductor(supabase, user.id);
  const scored = evaluateOpportunity(conductor, title, description);

  /*
   * Reuse semantic intelligence only when it was produced from the exact same
   * Candidate Context. A stored search can be days old; Career Truth or
   * Direction may have changed since then, making its candidate-specific fit
   * stale even though the job itself is unchanged.
   */
  let semantic = semanticContext && semanticFit
    && semanticContextFingerprint === conductor.contextFingerprint
    ? { context: semanticContext, fit: semanticFit }
    : null;

  if (!semantic) {
    try {
      const assessed = await Promise.race([
        assessSemanticJobs(
          conductor.workflow.candidateContext,
          [{ key: "job", title, employer, location, description }],
          { safetyIdentifier: createSafetyIdentifier(user.id) },
        ),
        new Promise<Map<string, {
          context: import("@/lib/types").JobSemanticContext;
          fit: import("@/lib/types").SemanticJobFit;
        }>>((_, reject) => setTimeout(() => reject(new Error("Semantic Job Context timed out")), 10_000)),
      ]);
      semantic = assessed.get("job") ?? null;
    } catch (caught) {
      console.warn("Semantic Job Context unavailable while saving; keeping canonical match", caught);
    }
  }

  const ruleAnalysis = {
    ...scored.analysis,
    scoringContextFingerprint: conductor.contextFingerprint,
    ...(semantic
      ? {
          semanticContext: semantic.context,
          semanticFit: semantic.fit,
          semanticContextFingerprint: conductor.contextFingerprint,
        }
      : semanticContext
        ? { semanticContext }
        : {}),
  };

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
        rule_analysis: ruleAnalysis,
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
      rule_analysis: ruleAnalysis,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Unable to save opportunity", error);
    return NextResponse.json({ error: "Sartho could not save this opportunity." }, { status: 500 });
  }
  return NextResponse.json({ job: data, existing: false }, { status: 201 });
}
