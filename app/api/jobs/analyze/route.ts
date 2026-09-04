import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { embedText } from "@/lib/ai/embed";

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { description } = await req.json();

    if (!description || description.trim().length < 50) {
      return NextResponse.json({ error: "Job description is too short to analyze." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    // 1. Ask LLM to extract key requirements from the job description
    const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: "You are an expert technical recruiter. Extract the 5 most important skills/requirements from the provided job description. Return JSON exactly like this: { \"requirements\": [\"AWS Architecture\", \"Agile Team Leadership\"] }"
        }, {
          role: "user",
          content: description
        }],
        response_format: { type: "json_object" }
      })
    });

    if (!extractRes.ok) throw new Error("Failed to extract requirements");
    const extractData = await extractRes.json();
    
    // Parse response
    let requirements: string[] = [];
    try {
      const parsed = JSON.parse(extractData.choices[0].message.content);
      requirements = parsed.requirements || [];
    } catch {
      requirements = [];
    }

    if (requirements.length === 0) {
      return NextResponse.json({ error: "Failed to parse requirements" }, { status: 500 });
    }

    // 2. Vectorize the requirements and search the Semantic Graph
    const matchedEvidence = [];
    const missingSkills = [];

    for (const req of requirements) {
      const reqVector = await embedText(req);
      
      const { data: matches, error } = await supabase.rpc("match_evidence", {
        query_embedding: `[${reqVector.join(",")}]`,
        match_threshold: 0.55, // Relaxed slightly for prototype semantic matching
        match_count: 1,
        p_user_id: user.id
      });

      if (!error && matches && matches.length > 0) {
        matchedEvidence.push({
          requirement: req,
          evidence: matches[0].content,
          similarity: matches[0].similarity
        });
      } else {
        missingSkills.push(req);
      }
    }

    // 3. Final synthesis
    const coverage = Math.round((matchedEvidence.length / requirements.length) * 100);
    let recommendation = "skip";
    if (coverage >= 75) recommendation = "apply";
    else if (coverage >= 40) recommendation = "review";

    return NextResponse.json({
      recommendation,
      coverage,
      matchedRequirements: matchedEvidence,
      missingSkills,
      requirementsCount: requirements.length,
      explanation: `Sartho mapped the ${requirements.length} core requirements of this role against your Semantic Skill Graph. You are a strong semantic match for ${matchedEvidence.length} of them.`
    });

  } catch (error: unknown) {
    console.error("Semantic Job Analysis Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
