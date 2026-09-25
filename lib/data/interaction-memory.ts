import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INTERACTION_EVENT_TYPES,
  type InteractionEventRecord,
  type InteractionEventType,
} from "@/lib/context/interaction-memory";

export type InteractionSource = "search" | "extension" | "pipeline";

export type InteractionInput = {
  eventType: InteractionEventType;
  source: InteractionSource;
  jobId?: string | null;
  title?: string;
  employer?: string | null;
  location?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
};

const LOW_SIGNAL_DEDUPE_MS = 6 * 60 * 60 * 1000;
const LOW_SIGNAL_EVENTS = new Set<InteractionEventType>([
  "search_result_viewed",
  "job_opened",
  "deep_analysis_requested",
]);

function cleanMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const encoded = JSON.stringify(value);
  if (encoded.length > 4000) return {};
  return value;
}

export function isInteractionEventType(value: unknown): value is InteractionEventType {
  return typeof value === "string" && (INTERACTION_EVENT_TYPES as readonly string[]).includes(value);
}

export async function recordCandidateInteraction(
  supabase: SupabaseClient,
  userId: string,
  input: InteractionInput,
): Promise<{ inserted: boolean }> {
  let title = input.title?.trim() ?? "";
  let employer = input.employer?.trim() || null;
  let location = input.location?.trim() || null;
  let sourceUrl = input.sourceUrl?.trim() || null;

  if (input.jobId) {
    const { data: job, error } = await supabase
      .from("jobs")
      .select("id,title,employer,location,source_url")
      .eq("id", input.jobId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!job) throw new Error("Opportunity not found.");

    title = job.title;
    employer = job.employer;
    location = job.location;
    sourceUrl = job.source_url;
  }

  if (!title) throw new Error("Interaction title is required.");

  /*
   * Repeated refreshes must not become preference. Low-signal events are
   * deduplicated for six hours per job/title. Strong actions such as save,
   * import, apply and interview are all retained because the state transition
   * itself is meaningful and relatively rare.
   */
  if (LOW_SIGNAL_EVENTS.has(input.eventType)) {
    const since = new Date(Date.now() - LOW_SIGNAL_DEDUPE_MS).toISOString();
    let query = supabase
      .from("candidate_interactions")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", input.eventType)
      .gte("occurred_at", since)
      .limit(1);

    query = input.jobId
      ? query.eq("job_id", input.jobId)
      : query.eq("title", title);

    const { data: existing, error } = await query.maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    if (existing) return { inserted: false };
  }

  const { error } = await supabase.from("candidate_interactions").insert({
    user_id: userId,
    job_id: input.jobId ?? null,
    event_type: input.eventType,
    source: input.source,
    title,
    employer,
    location,
    source_url: sourceUrl,
    metadata: cleanMetadata(input.metadata),
  });
  if (error) throw error;

  return { inserted: true };
}

export async function getCandidateInteractions(
  supabase: SupabaseClient,
  userId: string,
  limit = 500,
): Promise<InteractionEventRecord[]> {
  const { data, error } = await supabase
    .from("candidate_interactions")
    .select("id,user_id,job_id,event_type,source,title,employer,location,source_url,metadata,occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as InteractionEventRecord[];
}
