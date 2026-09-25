export const INTERACTION_EVENT_TYPES = [
  "search_result_viewed",
  "search_result_saved",
  "job_imported",
  "job_opened",
  "deep_analysis_requested",
  "status_applied",
  "status_assessment",
  "status_interview",
  "status_offer",
  "status_withdrawn",
  "status_rejected",
] as const;

export type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];

export type InteractionEventRecord = {
  id: string;
  user_id: string;
  job_id: string | null;
  event_type: InteractionEventType;
  source: "search" | "extension" | "pipeline";
  title: string;
  employer: string | null;
  location: string | null;
  source_url: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export type LearnedAffinitySignal = {
  concept: string;
  polarity: "positive" | "negative";
  reason: string;
  confidence: number;
  source: "interaction" | "market_outcome";
  eventIds: string[];
};

/*
 * Behaviour is evidence, but not all behaviour says the same thing.
 *
 * A view is curiosity. Saving is deliberate. Importing from a third-party board
 * is stronger again because the user actively brought the role into Sartho.
 * Application progression is strong market/user evidence. Rejection is market
 * feedback, never interpreted as dislike. Withdrawal is the one strong negative
 * preference signal because the user chose to stop.
 */
const EVENT_STRENGTH: Record<InteractionEventType, number> = {
  search_result_viewed: 0.08,
  search_result_saved: 0.45,
  job_imported: 0.65,
  job_opened: 0.12,
  deep_analysis_requested: 0.3,
  status_applied: 0.8,
  status_assessment: 0.85,
  status_interview: 0.92,
  status_offer: 1,
  status_withdrawn: 0.8,
  status_rejected: 0.75,
};

export function interactionStrength(type: InteractionEventType): number {
  return EVENT_STRENGTH[type];
}

function titleConcept(event: InteractionEventRecord): string {
  return event.title.trim();
}

export function deriveLearnedAffinity(events: InteractionEventRecord[]): LearnedAffinitySignal[] {
  type Bucket = {
    concept: string;
    preferencePositive: number;
    preferenceNegative: number;
    marketPositive: number;
    marketNegative: number;
    eventIds: string[];
    reasons: string[];
  };

  const buckets = new Map<string, Bucket>();

  for (const event of events) {
    const concept = titleConcept(event);
    if (!concept) continue;

    const key = concept.toLocaleLowerCase();
    const bucket = buckets.get(key) ?? {
      concept,
      preferencePositive: 0,
      preferenceNegative: 0,
      marketPositive: 0,
      marketNegative: 0,
      eventIds: [],
      reasons: [],
    };

    const weight = interactionStrength(event.event_type);
    bucket.eventIds.push(event.id);

    switch (event.event_type) {
      case "search_result_viewed":
      case "search_result_saved":
      case "job_imported":
      case "job_opened":
      case "deep_analysis_requested":
      case "status_applied":
        bucket.preferencePositive += weight;
        break;
      case "status_assessment":
      case "status_interview":
      case "status_offer":
        bucket.marketPositive += weight;
        break;
      case "status_withdrawn":
        bucket.preferenceNegative += weight;
        break;
      case "status_rejected":
        bucket.marketNegative += weight;
        break;
    }

    bucket.reasons.push(event.event_type.replaceAll("_", " "));
    buckets.set(key, bucket);
  }

  const learned: LearnedAffinitySignal[] = [];

  for (const bucket of buckets.values()) {
    /*
     * Weak curiosity never becomes persistent affinity by itself. One save or
     * import can establish a tentative signal; repeated opens/views must
     * accumulate before they count.
     */
    if (bucket.preferencePositive >= 0.4 || bucket.preferenceNegative >= 0.6) {
      const positive = bucket.preferencePositive >= bucket.preferenceNegative;
      const magnitude = Math.max(bucket.preferencePositive, bucket.preferenceNegative);
      learned.push({
        concept: bucket.concept,
        polarity: positive ? "positive" : "negative",
        reason: positive
          ? "Repeated or deliberate interaction with roles carrying this title."
          : "The user withdrew from roles carrying this title.",
        confidence: Math.min(0.85, Math.max(0.35, magnitude / 2)),
        source: "interaction",
        eventIds: bucket.eventIds,
      });
    }

    if (bucket.marketPositive >= 0.8 || bucket.marketNegative >= 1.5) {
      const positive = bucket.marketPositive >= bucket.marketNegative;
      const magnitude = Math.max(bucket.marketPositive, bucket.marketNegative);
      learned.push({
        concept: bucket.concept,
        polarity: positive ? "positive" : "negative",
        reason: positive
          ? "Applications for this role type progressed beyond initial screening."
          : "Repeated applications for this role type ended without progression.",
        confidence: Math.min(0.9, Math.max(0.4, magnitude / 2.5)),
        source: "market_outcome",
        eventIds: bucket.eventIds,
      });
    }
  }

  return learned.sort((a, b) => b.confidence - a.confidence || a.concept.localeCompare(b.concept));
}
