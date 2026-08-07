import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateStructuredJson } from "./provider";
import { RESUME_EXTRACTION_SCHEMA, RESUME_EXTRACTION_SYSTEM } from "@/lib/resume/extraction-schema";

/*
 * Paid, opt-in production contract checks. They are excluded from ordinary
 * tests and send only the redacted fixtures below. Together they verify both
 * task tiers rather than merely proving that an API key is accepted.
 */

const live = process.env.LIVE_AI_CHECK === "1" && Boolean(process.env.OPENAI_API_KEY);

describe.runIf(live)("the live OpenAI routing contract", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_MODEL", "");
  });

  it("uses Luna to extract grounded career evidence", async () => {
    const result = await generateStructuredJson({
      workload: "fast",
      schemaName: "sartho_resume_extraction_live",
      schema: RESUME_EXTRACTION_SCHEMA,
      system: RESUME_EXTRACTION_SYSTEM,
      prompt: JSON.stringify({
        resumeText: [
          "ALEX MORGAN — Workplace Technology Lead",
          "NORTHSTAR BANK — Technology Lead, 2021 to present",
          "Reduced major incidents by 37% across a 24,000-device estate.",
          "Led a Windows migration across seven countries without inventing unsupported results.",
        ].join("\n"),
      }),
    }) as { roles: unknown[]; evidence: Array<{ claim: string }> };

    expect(result.roles.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).toMatch(/37%|24,000|Northstar/i);
  }, 120_000);

  it("uses Terra to link requirements only to supplied evidence IDs", async () => {
    const result = await generateStructuredJson({
      workload: "quality",
      schemaName: "sartho_evidence_link_live",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["matches", "gaps"],
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["requirement", "evidenceIds"],
              properties: {
                requirement: { type: "string" },
                evidenceIds: { type: "array", items: { type: "string", enum: ["evidence-1"] } },
              },
            },
          },
          gaps: { type: "array", items: { type: "string" } },
        },
      },
      system: "Match requirements only to explicit supplied evidence. Never invent evidence IDs or capabilities.",
      prompt: JSON.stringify({
        requirements: ["Large endpoint estate leadership", "CISSP certification"],
        evidence: [{ id: "evidence-1", claim: "Led workplace technology across 24,000 devices" }],
      }),
    }) as { matches: Array<{ evidenceIds: string[] }>; gaps: string[] };

    const citedIds = result.matches.flatMap((match) => match.evidenceIds);
    expect(citedIds.length).toBeGreaterThan(0);
    expect(citedIds.every((id) => id === "evidence-1")).toBe(true);
    expect(result.gaps.join(" ")).toMatch(/CISSP/i);
  }, 120_000);
});
