import { describe, expect, it } from "vitest";
import { deriveLearnedAffinity, type InteractionEventRecord } from "./interaction-memory";

function event(
  id: string,
  event_type: InteractionEventRecord["event_type"],
  title = "ServiceNow Delivery Director",
): InteractionEventRecord {
  return {
    id,
    user_id: "u",
    job_id: null,
    event_type,
    source: event_type === "job_imported" ? "extension" : "pipeline",
    title,
    employer: "Example",
    location: "Singapore",
    source_url: "https://example.com/job",
    metadata: {},
    occurred_at: "2026-09-25T00:00:00Z",
  };
}

describe("deriveLearnedAffinity", () => {
  it("does not convert a single view or open into persistent preference", () => {
    expect(deriveLearnedAffinity([
      event("v1", "search_result_viewed"),
      event("o1", "job_opened"),
    ])).toEqual([]);
  });

  it("treats a deliberate extension import as tentative positive affinity", () => {
    const learned = deriveLearnedAffinity([event("i1", "job_imported")]);
    const preference = learned.find((signal) => signal.source === "interaction");

    expect(preference?.concept).toBe("ServiceNow Delivery Director");
    expect(preference?.polarity).toBe("positive");
    expect(preference?.confidence).toBeGreaterThanOrEqual(0.35);
    expect(preference?.eventIds).toEqual(["i1"]);
  });

  it("treats applying as strong user intent without pretending it is market validation", () => {
    const learned = deriveLearnedAffinity([event("a1", "status_applied")]);

    expect(learned).toHaveLength(1);
    expect(learned[0].source).toBe("interaction");
    expect(learned[0].polarity).toBe("positive");
  });

  it("treats interview and offer progression as market-positive evidence", () => {
    const learned = deriveLearnedAffinity([
      event("n1", "status_interview"),
      event("n2", "status_offer"),
    ]);

    const market = learned.find((signal) => signal.source === "market_outcome");
    expect(market?.polarity).toBe("positive");
    expect(market?.confidence).toBeGreaterThan(0.5);
  });

  it("never interprets one rejection as user dislike", () => {
    const learned = deriveLearnedAffinity([
      event("r1", "status_rejected"),
    ]);

    expect(learned.find((signal) => signal.source === "interaction" && signal.polarity === "negative")).toBeUndefined();
    expect(learned.find((signal) => signal.source === "market_outcome")).toBeUndefined();
  });

  it("requires repeated rejection evidence before surfacing a market-negative pattern", () => {
    const learned = deriveLearnedAffinity([
      event("r1", "status_rejected"),
      event("r2", "status_rejected"),
    ]);

    const market = learned.find((signal) => signal.source === "market_outcome");
    expect(market?.polarity).toBe("negative");
    expect(market?.reason).toContain("Repeated applications");
  });

  it("treats withdrawal as a strong negative preference signal", () => {
    const learned = deriveLearnedAffinity([
      event("w1", "status_withdrawn"),
    ]);

    const preference = learned.find((signal) => signal.source === "interaction");
    expect(preference?.polarity).toBe("negative");
  });

  it("keeps different job-title concepts separate rather than smearing one click across a career", () => {
    const learned = deriveLearnedAffinity([
      event("i1", "job_imported", "ServiceNow Delivery Director"),
      event("i2", "job_imported", "SAP FICO Architect"),
    ]);

    expect(learned.map((signal) => signal.concept).sort()).toEqual([
      "SAP FICO Architect",
      "ServiceNow Delivery Director",
    ]);
  });
});
