import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateStructuredJson } from "./provider";

/*
 * Which provider gets asked, in what order, and what actually goes over the
 * wire. None of that is visible from the outside — the result is the same shape
 * whoever answered — so without this the free provider could quietly never be
 * reached, or be reached with a schema it rejects, and the only symptom would
 * be a bill or a failed upload.
 */

const REQUEST = {
  schemaName: "sartho_resume_extraction",
  system: "You read one résumé.",
  prompt: JSON.stringify({ resumeText: "BARCLAYS — Head of EUC" }),
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "roles"],
    properties: {
      headline: { type: ["string", "null"] },
      roles: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["employer"],
          properties: { employer: { type: "string" } },
        },
      },
    },
  },
};

type Call = { url: string; init: RequestInit };

let calls: Call[];
const fetchMock = vi.fn();

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}
function fails(message: string) {
  return { ok: false, json: async () => ({ error: { message } }) };
}

const GEMINI_OK = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"headline":"Head of EUC","roles":[]}' }] } }] };
const ANTHROPIC_OK = { content: [{ type: "text", text: '{"headline":"from anthropic","roles":[]}' }] };
const OPENAI_OK = { output: [{ content: [{ type: "output_text", text: '{"headline":"from openai","roles":[]}' }] }] };

beforeEach(() => {
  calls = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(ok(GEMINI_OK));
  });
  vi.stubGlobal("fetch", fetchMock);
  for (const key of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
    vi.stubEnv(key, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function bodyOf(call: Call) {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

describe("generateStructuredJson", () => {
  it("says which keys it accepts when none are set", async () => {
    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/GEMINI_API_KEY.*ANTHROPIC_API_KEY.*OPENAI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries the free provider first when every key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    vi.stubEnv("OPENAI_API_KEY", "o-key");

    await generateStructuredJson(REQUEST);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
  });

  it("keeps the key out of the URL", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-secret");
    await generateStructuredJson(REQUEST);

    expect(calls[0].url).not.toContain("g-secret");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-secret");
  });

  it("sends Gemini a schema in its own dialect, not raw JSON Schema", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    await generateStructuredJson(REQUEST);

    const config = bodyOf(calls[0]).generationConfig as Record<string, unknown>;
    const schema = JSON.stringify(config.responseSchema);

    expect(config.responseMimeType).toBe("application/json");
    expect(schema).not.toContain("additionalProperties");
    expect(schema).not.toContain('"null"');
    expect(schema).toContain('"nullable":true');
  });

  it("moves to the next provider when the free one has nothing left", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");

    fetchMock.mockImplementationOnce((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(fails("Quota exceeded for quota metric 'Generate Content API requests'"));
    });
    fetchMock.mockImplementationOnce((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(ok(ANTHROPIC_OK));
    });

    const result = await generateStructuredJson(REQUEST) as { headline: string };

    expect(calls.map((c) => new URL(c.url).host)).toEqual([
      "generativelanguage.googleapis.com",
      "api.anthropic.com",
    ]);
    expect(result.headline).toBe("from anthropic");
  });

  it("falls all the way through to the last provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    vi.stubEnv("OPENAI_API_KEY", "o-key");

    fetchMock.mockImplementationOnce(() => Promise.resolve(fails("gemini down")));
    fetchMock.mockImplementationOnce(() => Promise.resolve(fails("anthropic down")));
    fetchMock.mockImplementationOnce(() => Promise.resolve(ok(OPENAI_OK)));

    const result = await generateStructuredJson(REQUEST) as { headline: string };
    expect(result.headline).toBe("from openai");
  });

  it("reports the last failure in plain words when every provider is out", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");

    fetchMock.mockImplementation(() =>
      Promise.resolve(fails("Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.")),
    );

    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/run out of credit/);
  });

  it("names truncation as truncation rather than failing to parse", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    fetchMock.mockImplementation(() =>
      Promise.resolve(ok({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"headline":' }] } }] })),
    );

    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/more detail than one reply can hold/);
  });

  it("accepts GOOGLE_API_KEY as well, since Studio hands out both names", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "g-key");
    await generateStructuredJson(REQUEST);
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
  });

  it("uses the model named in the environment", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");

    await generateStructuredJson(REQUEST);
    expect(calls[0].url).toContain("gemini-2.5-flash:generateContent");
  });
});
