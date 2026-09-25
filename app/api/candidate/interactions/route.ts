import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { INTERACTION_EVENT_TYPES } from "@/lib/context/interaction-memory";
import { recordCandidateInteraction } from "@/lib/data/interaction-memory";

const schema = z.object({
  eventType: z.enum(INTERACTION_EVENT_TYPES),
  source: z.enum(["search", "extension", "pipeline"]),
  jobId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(240).optional(),
  employer: z.string().trim().max(240).nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid interaction event." }, { status: 400 });

  try {
    const result = await recordCandidateInteraction(supabase, user.id, parsed.data);
    return NextResponse.json(result, { status: result.inserted ? 201 : 200 });
  } catch (caught) {
    console.error("Unable to record candidate interaction", caught);
    return NextResponse.json({ error: "Interaction could not be recorded." }, { status: 500 });
  }
}
