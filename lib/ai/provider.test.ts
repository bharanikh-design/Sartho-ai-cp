import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSafetyIdentifier,
  generateStructuredJson,
  getProviderRoute,
  probeProviders,
} from "./provider";

const REQUEST = {
  workload: "fast" as const,
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

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const GEMINI_OK = {
  candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"headline":"from gemini","roles":[]}' }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
};
const ANTHROPIC_OK = {
  content: [{ type: "text", text: '{"headline":"from anthropic","roles":[]}' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};
const OPENAI_OK = {
  output: [{ content: [{ type: "output_text", text: '{"headline":"from openai","roles":[]}' }] }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

beforeEach(() => {
  calls = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("openai.com")) return Promise.resolve(response(200, OPENAI_OK));
    if (url.includes("anthropic.com")) return Promise.resolve(response(200, ANTHROPIC_OK));
    return Promise.resolve(response(200, GEMINI_OK));
  });
  vi.stubGlobal("fetch", fetchMock);

  for (const key of [
    "AI_PROVIDER",
    "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_DATA_TIER", "GEMINI_MODEL",
    "GEMINI_FAST_MODEL", "GEMINI_QUALITY_MODEL", "GEMINI_FALLBACK_MODEL",
    "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ANTHROPIC_FAST_MODEL",
    "ANTHROPIC_QUALITY_MODEL", "ANTHROPIC_FALLBACK_MODEL",
    "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_FAST_MODEL",
    "OPENAI_QUALITY_MODEL", "OPENAI_FALLBACK_MODEL",
  ]) {
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

describe("explicit provider routing", () => {
  it("defaults to OpenAI and names only the key that deployment needs", async () => {
    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/OpenAI.*OPENAI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Luna for extraction even when every provider key exists", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");

    const result = await generateStructuredJson(REQUEST) as { headline: string };

    expect(result.headline).toBe("from openai");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toContain("api.openai.com");
    expect(bodyOf(calls[0]).model).toBe("gpt-5.6-luna");
    expect(bodyOf(calls[0]).reasoning).toEqual({ effort: "none" });
  });

  it("uses Terra with balanced reasoning for quality-critical work", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");

    await generateStructuredJson({ ...REQUEST, workload: "quality" });

    expect(bodyOf(calls[0]).model).toBe("gpt-5.6-terra");
    expect(bodyOf(calls[0]).reasoning).toEqual({ effort: "medium" });
  });

  it("keeps strict structured output and disables response storage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");

    await generateStructuredJson(REQUEST);

    const body = bodyOf(calls[0]);
    expect(body.store).toBe(false);
    expect(body.text).toMatchObject({
      format: { type: "json_schema", name: REQUEST.schemaName, strict: true },
    });
  });

  it("sends a stable privacy-preserving safety identifier, never the user ID", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    const userId = "46b94ca5-88d8-4ad4-a864-5b232e966b72";
    const safetyIdentifier = createSafetyIdentifier(userId);

    await generateStructuredJson({ ...REQUEST, safetyIdentifier });

    expect(safetyIdentifier).toHaveLength(64);
    expect(safetyIdentifier).not.toContain(userId);
    expect(bodyOf(calls[0]).safety_identifier).toBe(safetyIdentifier);
  });

  it("does not send data to another company after a terminal failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(response(401, { error: { message: "Incorrect API key provided" } }));
    });

    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/rejected its key/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls.every((call) => call.url.includes("openai.com"))).toBe(true);
  });

  it("retries the same model once for a transient failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    fetchMock
      .mockImplementationOnce((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(response(429, { error: { message: "Rate limit reached" } }));
      })
      .mockImplementationOnce((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(response(200, OPENAI_OK));
      });

    await generateStructuredJson(REQUEST);

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => bodyOf(call).model)).toEqual(["gpt-5.6-luna", "gpt-5.6-luna"]);
  });

  it("does not retry a permanent billing failure reported as HTTP 429", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(response(429, {
        error: { message: "You exceeded your current quota. Please check your plan and billing details." },
      }));
    });

    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/run out of credit/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a stronger same-provider model when Luna is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    fetchMock
      .mockImplementationOnce((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(response(404, { error: { message: "model not found" } }));
      })
      .mockImplementationOnce((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(response(200, OPENAI_OK));
      });

    await generateStructuredJson(REQUEST);

    expect(calls.map((call) => bodyOf(call).model)).toEqual(["gpt-5.6-luna", "gpt-5.6-terra"]);
    expect(calls.every((call) => call.url.includes("openai.com"))).toBe(true);
  });

  it("preserves an explicit legacy model override without inventing a fallback", () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    vi.stubEnv("OPENAI_MODEL", "approved-model-snapshot");

    expect(getProviderRoute("fast")).toMatchObject({
      primaryModel: "approved-model-snapshot",
      fallbackModel: null,
    });
  });
});

describe("controlled emergency providers", () => {
  it("refuses Gemini unless paid-service data handling is acknowledged", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "g-key");

    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/GEMINI_DATA_TIER=paid/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses only paid Gemini when an operator explicitly selects it", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_DATA_TIER", "paid");
    vi.stubEnv("GEMINI_API_KEY", "g-secret");
    vi.stubEnv("OPENAI_API_KEY", "o-key");

    const result = await generateStructuredJson(REQUEST) as { headline: string };

    expect(result.headline).toBe("from gemini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toContain("gemini-3.5-flash-lite:generateContent");
    expect(calls[0].url).not.toContain("g-secret");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-secret");
  });

  it("keeps Gemini JSON-compatible without sending its unsupported schema dialect", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_DATA_TIER", "paid");
    vi.stubEnv("GEMINI_API_KEY", "g-key");

    await generateStructuredJson(REQUEST);

    const body = bodyOf(calls[0]);
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
    expect(config).not.toHaveProperty("temperature");
    expect(config).not.toHaveProperty("responseSchema");
    expect(JSON.stringify(body.systemInstruction)).toContain("JSON Schema");
  });

  it("gives detailed résumé extraction more output room without relaxing other cost limits", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_DATA_TIER", "paid");
    vi.stubEnv("GEMINI_API_KEY", "g-key");

    await generateStructuredJson(REQUEST);
    expect((bodyOf(calls[0]).generationConfig as Record<string, unknown>).maxOutputTokens).toBe(32_768);

    await generateStructuredJson({ ...REQUEST, schemaName: "sartho_job_analysis" });
    expect((bodyOf(calls[1]).generationConfig as Record<string, unknown>).maxOutputTokens).toBe(8_192);
  });

  it("does not send Sonnet 5 a sampling parameter it rejects", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");

    await generateStructuredJson({ ...REQUEST, workload: "quality" });

    const body = bodyOf(calls[0]);
    expect(body.model).toBe("claude-sonnet-5");
    expect(body).not.toHaveProperty("temperature");
  });

  it("rejects unknown provider names instead of guessing", async () => {
    vi.stubEnv("AI_PROVIDER", "cheapest-whatever-works");
    await expect(generateStructuredJson(REQUEST)).rejects.toThrow(/AI_PROVIDER must be/);
  });
});

describe("Gemini catalogue helpers", () => {
  it("prefers a stable flash model and skips unusable entries", async () => {
    const { chooseGeminiModel } = await import("./provider");
    expect(chooseGeminiModel([
      "text-embedding-004",
      "gemini-3-flash-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ])).toBe("gemini-2.5-flash");
  });

  it("recognises model availability failures without confusing bad keys", async () => {
    const { isGeminiModelUnavailable } = await import("./provider");
    expect(isGeminiModelUnavailable("limit: 0, model: gemini-old")).toBe(true);
    expect(isGeminiModelUnavailable("This model is no longer available")).toBe(true);
    expect(isGeminiModelUnavailable("API key not valid")).toBe(false);
  });
});

describe("cost-controlled provider diagnostics", () => {
  it("contacts only the active provider and leaves configured standbys unprobed", async () => {
    vi.stubEnv("OPENAI_API_KEY", "o-key");
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("GEMINI_DATA_TIER", "paid");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");

    const providers = await probeProviders();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toContain("api.openai.com");
    expect(providers.find((provider) => provider.name === "OpenAI")).toMatchObject({
      selected: true,
      reachable: true,
    });
    expect(providers.filter((provider) => !provider.selected)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Gemini", configured: true, reachable: null }),
        expect.objectContaining({ name: "Anthropic", configured: true, reachable: null }),
      ]),
    );
  });
});
