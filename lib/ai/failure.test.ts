import { describe, expect, it } from "vitest";
import { classifyAiFailure, describeAiFailure, DOCUMENT_SUBJECT, RESUME_BUILD_SUBJECT, REWRITE_SUBJECT } from "./failure";

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

  it("says the person's own work is not the problem, because it is not", () => {
    expect(describeAiFailure(OVER_QUOTA, DOCUMENT_SUBJECT)).toContain("Nothing is wrong with your résumé");
    expect(describeAiFailure(OVER_QUOTA)).toContain("Nothing is wrong with your data");
    expect(describeAiFailure("Rate limit reached")).toContain("Nothing is wrong with your data");
  });

  it("names the lever for the person who owns the deployment", () => {
    expect(describeAiFailure(OUT_OF_CREDIT)).toContain("Top up");
    expect(describeAiFailure("Incorrect API key provided")).toContain("environment variables");
  });

  it("never passes an unrecognised provider message through to the user", () => {
    const odd = "upstream exploded with request abc-123 at https://provider.example/internal";
    const spoken = describeAiFailure(odd);
    expect(spoken).toContain("could not finish that request");
    expect(spoken).not.toContain("abc-123");
    expect(spoken).not.toContain("provider.example");
  });

  it("does not print Google's retired-model diagnostics on the upload screen", () => {
    const spoken = describeAiFailure(
      "models/gemini-1.5-pro is not found for API version v1beta, or is not supported for generateContent. (model: gemini-1.5-pro)",
      DOCUMENT_SUBJECT,
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

  /*
   * The default used to be the document wording, and lib/ai/provider formats
   * every failure it raises — so a résumé that could not be BUILT told the
   * person Sartho "could not read the document" and to "upload it again".
   * There was no document, and uploading one would not have helped.
   */
  it("does not talk about documents when the caller never mentioned one", () => {
    const spoken = describeAiFailure(OUT_OF_CREDIT);
    expect(spoken).not.toContain("read the document");
    expect(spoken).not.toContain("upload it again");
    expect(spoken).toContain("finish that request");
  });

  it("fits the sentence to what was actually being done", () => {
    expect(describeAiFailure(OUT_OF_CREDIT, RESUME_BUILD_SUBJECT)).toContain("build the résumé");
    expect(describeAiFailure(OUT_OF_CREDIT, RESUME_BUILD_SUBJECT)).toContain("Nothing is wrong with your evidence");
    expect(describeAiFailure(OUT_OF_CREDIT, DOCUMENT_SUBJECT)).toContain("read the document");
    expect(describeAiFailure(OUT_OF_CREDIT, REWRITE_SUBJECT)).toContain("rewrite that line");
  });
});

/*
 * The bracket that reached a real screen.
 *
 * generateStructuredJson appended " [DIAGNOSTIC: Available models for your key:
 * ...]" to the message it threw, so a red box on the opportunity page ended
 * with a dangling label and nothing after it — the key could list no models, so
 * the one thing that looked like a clue was empty. describeAiFailure exists to
 * keep provider internals out of the product; appending to its output defeated
 * that entirely.
 */
describe("what a person is allowed to see", () => {
  it("never names a model, a request id or a host, whatever the provider said", () => {
    const raw = [
      "models/gemini-2.0-flash is not found for API version v1beta",
      "request 7f3a-91 failed at https://generativelanguage.googleapis.com/v1beta/models",
      "Generative Language API has not been used in project 429174 before or it is disabled",
    ];
    for (const message of raw) {
      const spoken = describeAiFailure(message);
      expect(spoken).not.toContain("DIAGNOSTIC");
      expect(spoken).not.toMatch(/gemini-\d/);
      expect(spoken).not.toContain("googleapis.com");
      expect(spoken).not.toContain("7f3a-91");
      expect(spoken).not.toContain("429174");
    }
  });

  it("classifies Google's disabled-API refusal as something a person can act on", () => {
    /*
     * This is the shape behind the empty bracket: the project never had the
     * API switched on, so every call is refused and ListModels returns nothing.
     * It used to fall through to the generic "ask the administrator", which is
     * true but names no lever.
     */
    const message = "Generative Language API has not been used in project 429174 before or it is disabled.";
    expect(classifyAiFailure(message)).toBe("auth");
    expect(describeAiFailure(message)).toContain("environment variables");
  });
});
