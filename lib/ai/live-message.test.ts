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

/*
 * Near misses, each one a wording a provider uses that an earlier version of
 * the classifier did not recognise. An unmatched message is passed through
 * raw, so a near miss is the same as no classifier at all.
 */
describe("wordings that only just differ", () => {
  it("reads Google's 'not valid' the same as everyone else's 'invalid'", () => {
    expect(classifyAiFailure("API key not valid. Please pass a valid API key.")).toBe("auth");
  });

  it("reads a low balance as no credit, with no billing word present", () => {
    expect(classifyAiFailure("Your credit balance is too low to access the Anthropic API.")).toBe("credit");
  });

  /*
   * Google spends its free tier as a rate limit rather than a balance, so
   * "resource exhausted" means wait, not pay — and both the prose form and the
   * enum name have to land on the same answer.
   */
  it("reads Google's exhausted quota as rate limiting, in either wording", () => {
    expect(classifyAiFailure("Resource has been exhausted (e.g. check quota).")).toBe("rate-limit");
    expect(classifyAiFailure("RESOURCE_EXHAUSTED")).toBe("rate-limit");
  });
});
