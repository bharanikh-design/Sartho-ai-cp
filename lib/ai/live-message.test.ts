import { describe, expect, it } from "vitest";
import { classifyAiFailure, describeAiFailure } from "@/lib/ai/failure";

const ANTHROPIC_BROKE = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";

/*
 * The wording each provider actually sent from the live deployment, kept
 * verbatim. Providers reword their errors, and the day one of these stops
 * matching is the day a billing problem starts looking like a bug in Sartho
 * again — which is the whole reason this file exists.
 */
describe("the exact messages seen in production", () => {
  it("recognises an empty Anthropic account", () => {
    expect(classifyAiFailure(ANTHROPIC_BROKE)).toBe("credit");
  });
  it("never shows the provider's billing console to someone uploading a CV", () => {
    expect(describeAiFailure(ANTHROPIC_BROKE)).toContain("run out of credit");
    expect(describeAiFailure(ANTHROPIC_BROKE)).not.toContain("Plans & Billing");
  });
});
