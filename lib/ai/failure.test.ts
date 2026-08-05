import { describe, expect, it } from "vitest";
import { classifyAiFailure, describeAiFailure } from "./failure";

/*
 * The strings here are the ones the providers actually sent, copied from a
 * failed import — the point of this file is that those exact words never reach
 * someone who is only trying to upload a CV.
 */
const OUT_OF_CREDIT = "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";
const OVER_QUOTA = "You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.";

describe("classifyAiFailure", () => {
  it("recognises both shapes of an account with no money in it", () => {
    expect(classifyAiFailure(OUT_OF_CREDIT)).toBe("credit");
    expect(classifyAiFailure(OVER_QUOTA)).toBe("credit");
    expect(classifyAiFailure("insufficient_quota")).toBe("credit");
  });

  it("separates rate limiting from running out of credit", () => {
    expect(classifyAiFailure("Rate limit reached for gpt-5")).toBe("rate-limit");
    expect(classifyAiFailure("429 Too Many Requests")).toBe("rate-limit");
    expect(classifyAiFailure("Overloaded")).toBe("rate-limit");
  });

  it("recognises a bad key", () => {
    expect(classifyAiFailure("Incorrect API key provided: sk-abc")).toBe("auth");
    expect(classifyAiFailure("401 Unauthorized")).toBe("auth");
  });

  it("recognises a request that ran out of time", () => {
    expect(classifyAiFailure("The operation was aborted due to timeout")).toBe("timeout");
  });

  it("does not guess at anything else", () => {
    expect(classifyAiFailure("OpenAI returned no structured output.")).toBe("unknown");
  });
});

describe("describeAiFailure", () => {
  it("never shows a billing console link to someone uploading a CV", () => {
    const spoken = describeAiFailure(OUT_OF_CREDIT);
    expect(spoken).not.toContain("platform.openai.com");
    expect(spoken).not.toContain("quota");
  });

  it("says the résumé is not the problem, because it is not", () => {
    expect(describeAiFailure(OVER_QUOTA)).toContain("Nothing is wrong with your résumé");
    expect(describeAiFailure("Rate limit reached")).toContain("Nothing is wrong with your résumé");
  });

  it("names the lever for the person who owns the deployment", () => {
    expect(describeAiFailure(OUT_OF_CREDIT)).toContain("Top up");
    expect(describeAiFailure("Incorrect API key provided")).toContain("environment variables");
  });

  it("passes an unrecognised message through rather than inventing a cause", () => {
    const odd = "Sartho did not find any career evidence in that document.";
    expect(describeAiFailure(odd)).toBe(odd);
  });
});
