import { describe, expect, it } from "vitest";
import { classifyAiFailure, describeAiFailure, REWRITE_SUBJECT } from "./failure";

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

  it("recognises a retired Gemini model in the wording Google actually sent", () => {
    expect(classifyAiFailure(
      "models/gemini-1.5-pro is not found for API version v1beta, or is not supported for generateContent. (model: gemini-1.5-pro)",
    )).toBe("model");
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

  it("never passes an unrecognised provider message through to the user", () => {
    const odd = "upstream exploded with request abc-123 at https://provider.example/internal";
    const spoken = describeAiFailure(odd);
    expect(spoken).toContain("could not read the document");
    expect(spoken).not.toContain("abc-123");
    expect(spoken).not.toContain("provider.example");
  });

  it("does not print Google's retired-model diagnostics on the upload screen", () => {
    const spoken = describeAiFailure(
      "models/gemini-1.5-pro is not found for API version v1beta, or is not supported for generateContent. (model: gemini-1.5-pro)",
    );
    expect(spoken).toContain("no longer available");
    expect(spoken).toContain("Nothing is wrong with your résumé");
    expect(spoken).not.toContain("gemini-1.5-pro");
    expect(spoken).not.toContain("v1beta");
  });
});

/*
 * The Studio's bullet rewrite showed "Sartho could not rewrite this line. Your
 * draft is unchanged." for every failure there is — no credit, wrong key,
 * retired model, rate limit, malformed output. The provider had already worked
 * out which one it was and named the lever somebody could pull; the route threw
 * that away, leaving a Try again button that would fail identically for ever
 * with nothing on screen to say why.
 *
 * The classification is shared. Only the noun changes: beside one bullet in a
 * draft, "could not read the document" is about a different thing entirely.
 */
describe("describeAiFailure, said about a line rather than a document", () => {
  it("names the lever, in wording that fits where it is shown", () => {
    const spoken = describeAiFailure(OUT_OF_CREDIT, REWRITE_SUBJECT);
    expect(spoken).toContain("run out of credit");
    expect(spoken).toContain("rewrite that line");
    expect(spoken).toContain("Nothing is wrong with your draft");
    /* Never the upload wording, which is about a different screen entirely. */
    expect(spoken).not.toContain("the document");
    expect(spoken).not.toContain("your résumé");
    expect(spoken).not.toContain("upload it again");
  });

  it("tells a retired fast model apart from every other failure", () => {
    /*
     * The likely one here: drafting uses the quality model and rewriting uses
     * the fast model, so the résumé can generate perfectly while every rewrite
     * fails — a state the old catch-all made impossible to diagnose.
     */
    const spoken = describeAiFailure(
      "models/gemini-1.5-pro is not found for API version v1beta (model: gemini-1.5-pro)",
      REWRITE_SUBJECT,
    );
    expect(spoken).toContain("no longer available");
    expect(spoken).toContain("environment variables");
    expect(spoken).not.toContain("gemini-1.5-pro");
  });

  it("still refuses to print a raw provider message", () => {
    const spoken = describeAiFailure(
      "upstream exploded with request abc-123 at https://provider.example/internal",
      REWRITE_SUBJECT,
    );
    expect(spoken).toContain("could not rewrite that line");
    expect(spoken).not.toContain("abc-123");
    expect(spoken).not.toContain("provider.example");
  });

  it("keeps the document wording when no subject is given", () => {
    expect(describeAiFailure(OUT_OF_CREDIT)).toContain("read the document");
    expect(describeAiFailure(OUT_OF_CREDIT)).toContain("Nothing is wrong with your résumé");
  });
});
