import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateStructuredJson } from "./provider";
import { RESUME_EXTRACTION_SCHEMA, RESUME_EXTRACTION_SYSTEM } from "@/lib/resume/extraction-schema";

/*
 * The check that should have existed four failures ago.
 *
 * Every other test in this repository mocks fetch, so all of them passed while
 * production rejected the request — they proved the code sent what the code
 * meant to send, never that Google would accept it. The only thing that ever
 * found those four defects was a person uploading a CV and waiting.
 *
 * This talks to the real endpoint with a deliberately invalid key, because
 * Google validates the request body BEFORE it validates credentials. So:
 *
 *   rejected for the key   → the body is well formed, whatever else is wrong
 *   rejected for a field   → the body is malformed, and it says which field
 *
 * That single bit is the entire difference between the four production
 * failures and a working import, and it costs one unauthenticated request.
 *
 * It is off by default — tests must not need the network — and runs under
 * LIVE_AI_CHECK=1, locally or in CI, against the real extraction schema rather
 * than a small stand-in that would have passed every time.
 */

const live = process.env.LIVE_AI_CHECK === "1";

const REQUEST = {
  schemaName: "sartho_resume_extraction",
  schema: RESUME_EXTRACTION_SCHEMA,
  system: RESUME_EXTRACTION_SYSTEM,
  prompt: JSON.stringify({
    resumeText: [
      "BHARANI KUMAR H — Head of End User Computing, London",
      "BARCLAYS — Head of EUC Engineering, 2019 to present",
      "Cut major incident volume by 40% across a 60,000 device estate.",
    ].join("\n"),
  }),
};

/* Anything Google says about the body itself rather than about the caller. */
const ABOUT_THE_BODY = /unknown name|invalid json payload|proto field|invalid argument|responseSchema|field violation/i;

describe.runIf(live)("the live Gemini contract", () => {
  beforeEach(() => {
    /* One provider only: a fallback to Anthropic would hide the answer. */
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "not-a-real-key-on-purpose");
    /* Pinned, so a bad key cannot turn this into a test of model discovery. */
    vi.stubEnv("GEMINI_MODEL", process.env.GEMINI_MODEL || "gemini-flash-latest");
  });

  it("gets as far as the key, which means the request body is accepted", async () => {
    const failure = await generateStructuredJson(REQUEST).catch((error: Error) => error);

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;

    /* Read it out whichever way this goes — the message is the finding. */
    console.info(`\n  Google replied: ${message}\n`);

    expect(message).not.toMatch(ABOUT_THE_BODY);
    /* One provider configured, so this is the single-provider phrasing. */
    expect(message).toMatch(/rejected its key/i);
  }, 30_000);
});

/*
 * With a real key in the environment, go the whole way: one short résumé in,
 * parsed evidence out. This is the only test in the repository that proves the
 * feature works rather than that it is wired correctly.
 */
const realKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";

describe.runIf(live && realKey.length > 0)("a real extraction", () => {
  it("reads a résumé and returns the shape the route parses", async () => {
    const result = (await generateStructuredJson(REQUEST)) as {
      roles: unknown[];
      evidence: Array<{ claim: string }>;
    };

    expect(Array.isArray(result.roles)).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
    /* It must quote the résumé, not invent a better one. */
    expect(JSON.stringify(result)).toMatch(/40%|60,000|Barclays/i);
  }, 120_000);
});
