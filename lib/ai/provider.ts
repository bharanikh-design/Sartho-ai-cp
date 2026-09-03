import { createHash } from "node:crypto";
import { classifyAiFailure, describeAiFailure, shortAiFailure } from "./failure";
import { AI_ENDPOINTS } from "@/lib/config/ai-endpoints";

export type AiWorkload = "fast" | "quality";
export type AiProviderName = "openai" | "gemini" | "anthropic";

type StructuredRequest = {
  workload: AiWorkload;
  safetyIdentifier?: string;
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
};

type ProviderRoute = {
  provider: AiProviderName;
  key: string;
  primaryModel: string;
  fallbackModel: string | null;
};

type RetryKind = "transient" | "model_unavailable" | "terminal";

class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly retryKind: RetryKind,
    readonly status?: number,
  ) {
    super(message);
  }
}

const PROVIDER_NAMES: AiProviderName[] = ["openai", "gemini", "anthropic"];

export function createSafetyIdentifier(userId: string) {
  return createHash("sha256").update(`sartho:${userId}`).digest("hex");
}

export function getSelectedProvider(): AiProviderName {
  const configured = (process.env.AI_PROVIDER || "openai").trim().toLowerCase();
  if (!PROVIDER_NAMES.includes(configured as AiProviderName)) {
    throw new Error("AI_PROVIDER must be openai, gemini or anthropic.");
  }
  return configured as AiProviderName;
}

function requiredKey(value: string | undefined, provider: string, envVar: string) {
  if (!value) {
    throw new Error(`${provider} is selected but ${envVar} is not configured.`);
  }
  return value;
}

export function getProviderRoute(workload: AiWorkload): ProviderRoute {
  const provider = getSelectedProvider();

  if (provider === "openai") {
    const legacyModel = process.env.OPENAI_MODEL?.trim();
    const primaryModel = legacyModel || (workload === "fast"
      ? process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna"
      : process.env.OPENAI_QUALITY_MODEL || "gpt-5.6-terra");
    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim()
      || (legacyModel ? null : workload === "fast" ? "gpt-5.6-terra" : "gpt-5.6-sol");

    return {
      provider,
      key: requiredKey(process.env.OPENAI_API_KEY, "OpenAI", "OPENAI_API_KEY"),
      primaryModel,
      fallbackModel: fallbackModel === primaryModel ? null : fallbackModel,
    };
  }

  if (provider === "gemini") {
    if (process.env.GEMINI_DATA_TIER?.trim().toLowerCase() !== "paid") {
      throw new Error(
        "Gemini is disabled for résumé data until GEMINI_DATA_TIER=paid confirms paid-service data handling.",
      );
    }

    const legacyModel = process.env.GEMINI_MODEL?.trim();
    const primaryModel = legacyModel || (workload === "fast"
      ? process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite"
      : process.env.GEMINI_QUALITY_MODEL || "gemini-3.6-flash");
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim()
      || (legacyModel ? null : workload === "fast" ? "gemini-3.6-flash" : null);

    return {
      provider,
      key: requiredKey(
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        "Gemini",
        "GEMINI_API_KEY",
      ),
      primaryModel,
      fallbackModel: fallbackModel === primaryModel ? null : fallbackModel,
    };
  }

  const legacyModel = process.env.ANTHROPIC_MODEL?.trim();
  const primaryModel = legacyModel || (workload === "fast"
    ? process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5"
    : process.env.ANTHROPIC_QUALITY_MODEL || "claude-sonnet-5");
  const fallbackModel = process.env.ANTHROPIC_FALLBACK_MODEL?.trim()
    || (legacyModel ? null : workload === "fast" ? "claude-sonnet-5" : null);

  return {
    provider,
    key: requiredKey(process.env.ANTHROPIC_API_KEY, "Anthropic", "ANTHROPIC_API_KEY"),
    primaryModel,
    fallbackModel: fallbackModel === primaryModel ? null : fallbackModel,
  };
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("The AI provider did not return valid JSON.");
  return trimmed.slice(first, last + 1);
}

function failureKind(status: number, message: string): RetryKind {
  // Some providers report an exhausted billing balance with HTTP 429. That is
  // not a temporary rate limit, and retrying it only makes the user wait for a
  // second request that cannot succeed.
  const classified = classifyAiFailure(message);
  if (classified === "credit" || classified === "auth") return "terminal";
  if (status === 404 || isGeminiModelUnavailable(message) || /model.+(not found|unavailable|retired|deprecated)/i.test(message)) {
    return "model_unavailable";
  }
  if (status === 408 || status === 409 || status === 429 || status >= 500) return "transient";
  return "terminal";
}

function logAttempt(details: {
  provider: AiProviderName;
  model: string;
  workload: AiWorkload;
  latencyMs: number;
  outcome: "success" | "failed";
  inputTokens?: number;
  outputTokens?: number;
  status?: number;
}) {
  if (process.env.NODE_ENV === "test") return;
  // Operational metadata only. Prompts, outputs, filenames and user identity
  // are deliberately excluded from logs.
  console.info("ai_provider_call", JSON.stringify(details));
}

async function fetchProvider(
  provider: AiProviderName,
  model: string,
  workload: AiWorkload,
  url: string,
  init: RequestInit,
) {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (caught) {
    logAttempt({ provider, model, workload, latencyMs: Date.now() - startedAt, outcome: "failed" });
    const message = caught instanceof Error ? caught.message : `${provider} request failed.`;
    throw new ProviderRequestError(message, "transient");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    logAttempt({
      provider,
      model,
      workload,
      latencyMs: Date.now() - startedAt,
      outcome: "failed",
      status: response.status,
    });
    throw new ProviderRequestError(
      `${provider} returned an unreadable response.`,
      response.status >= 500 ? "transient" : "terminal",
      response.status,
    );
  }

  return { response, result, startedAt };
}

async function callOpenAI(request: StructuredRequest, apiKey: string, model: string) {
  const { response, result: unknownResult, startedAt } = await fetchProvider(
    "openai",
    model,
    request.workload,
    AI_ENDPOINTS.OPENAI_RESPONSES,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        ...(request.safetyIdentifier ? { safety_identifier: request.safetyIdentifier } : {}),
        reasoning: { effort: request.workload === "fast" ? "none" : "medium" },
        input: [
          { role: "system", content: [{ type: "input_text", text: request.system }] },
          { role: "user", content: [{ type: "input_text", text: request.prompt }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  const result = unknownResult as {
    error?: { message?: string };
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (!response.ok) {
    const message = result.error?.message ?? "OpenAI request failed.";
    logAttempt({
      provider: "openai", model, workload: request.workload,
      latencyMs: Date.now() - startedAt, outcome: "failed", status: response.status,
    });
    throw new ProviderRequestError(message, failureKind(response.status, message), response.status);
  }

  const text = result.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")
    ?.text;
  if (!text) throw new ProviderRequestError("OpenAI returned no structured output.", "terminal");

  logAttempt({
    provider: "openai", model, workload: request.workload,
    latencyMs: Date.now() - startedAt, outcome: "success",
    inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens,
  });
  return JSON.parse(extractJson(text)) as unknown;
}

async function callAnthropic(request: StructuredRequest, apiKey: string, model: string) {
  const { response, result: unknownResult, startedAt } = await fetchProvider(
    "anthropic",
    model,
    request.workload,
    AI_ENDPOINTS.ANTHROPIC_MESSAGES,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 7000,
        // Sonnet 5 rejects non-default sampling parameters. The schema remains
        // in the instruction and is still validated by the caller's Zod parser.
        system: `${request.system}\nReturn only one JSON object matching this JSON Schema:\n${JSON.stringify(request.schema)}`,
        messages: [{ role: "user", content: request.prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  const result = unknownResult as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (!response.ok) {
    const message = result.error?.message ?? "Anthropic request failed.";
    logAttempt({
      provider: "anthropic", model, workload: request.workload,
      latencyMs: Date.now() - startedAt, outcome: "failed", status: response.status,
    });
    throw new ProviderRequestError(message, failureKind(response.status, message), response.status);
  }

  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new ProviderRequestError("Anthropic returned no structured output.", "terminal");

  logAttempt({
    provider: "anthropic", model, workload: request.workload,
    latencyMs: Date.now() - startedAt, outcome: "success",
    inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens,
  });
  return JSON.parse(extractJson(text)) as unknown;
}

async function callGemini(request: StructuredRequest, apiKey: string, model: string) {
  /*
   * A detailed résumé can legitimately exceed the small default response
   * budget once every role and evidence claim is represented as JSON. Keep
   * the larger allowance scoped to that one workload: Gemini bills actual
   * output, not this ceiling, while every other Sartho request retains the
   * tighter cost guardrail.
   */
  const maxOutputTokens = request.schemaName === "sartho_resume_extraction"
    ? 32_768
    : 8_192;

  const { response, result: unknownResult, startedAt } = await fetchProvider(
    "gemini",
    model,
    request.workload,
    `${AI_ENDPOINTS.GEMINI_BASE}/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `${request.system}\nReturn only one JSON object matching this JSON Schema:\n${JSON.stringify(request.schema)}`,
          }],
        },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  const result = unknownResult as {
    error?: {
      message?: string;
      details?: Array<{ fieldViolations?: Array<{ field?: string; description?: string }> }>;
    };
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (!response.ok) {
    const violations = (result.error?.details ?? [])
      .flatMap((entry) => entry.fieldViolations ?? [])
      .map((violation) => [violation.field, violation.description].filter(Boolean).join(": "))
      .filter((line) => line.length > 0);
    const message = [`${result.error?.message ?? "Gemini request failed."} (model: ${model})`, ...violations].join(" — ");
    logAttempt({
      provider: "gemini", model, workload: request.workload,
      latencyMs: Date.now() - startedAt, outcome: "failed", status: response.status,
    });
    throw new ProviderRequestError(message, failureKind(response.status, message), response.status);
  }

  const candidate = result.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new ProviderRequestError(
      "The document produced more detail than one reply can hold. Try a shorter résumé.",
      "terminal",
    );
  }
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new ProviderRequestError("The provider declined to process that document.", "terminal");
  }

  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new ProviderRequestError("Gemini returned no structured output.", "terminal");

  logAttempt({
    provider: "gemini", model, workload: request.workload,
    latencyMs: Date.now() - startedAt, outcome: "success",
    inputTokens: result.usageMetadata?.promptTokenCount,
    outputTokens: result.usageMetadata?.candidatesTokenCount,
  });
  return JSON.parse(extractJson(text)) as unknown;
}

function callRoute(request: StructuredRequest, route: ProviderRoute, model: string) {
  if (route.provider === "openai") return callOpenAI(request, route.key, model);
  if (route.provider === "gemini") return callGemini(request, route.key, model);
  return callAnthropic(request, route.key, model);
}

/*
 * One selected data processor, with at most one bounded recovery attempt.
 * A transient failure retries the same model once. A retired or unavailable
 * model moves to the configured fallback inside the same provider. No résumé
 * or job data crosses company boundaries without an operator changing
 * AI_PROVIDER for the whole deployment.
 */
export async function generateStructuredJson(request: StructuredRequest) {
  const route = getProviderRoute(request.workload);
  try {
    return await callRoute(request, route, route.primaryModel);
  } catch (caught) {
    if (!(caught instanceof ProviderRequestError)) throw caught;

    try {
      if (caught.retryKind === "transient") {
        return await callRoute(request, route, route.primaryModel);
      }
      if (caught.retryKind === "model_unavailable" && route.fallbackModel) {
        return await callRoute(request, route, route.fallbackModel);
      }
    } catch (retryFailure) {
      if (retryFailure instanceof Error) throw new Error(describeAiFailure(retryFailure.message));
      throw retryFailure;
    }

    throw new Error(describeAiFailure(caught.message));
  }
}

export function isGeminiModelUnavailable(message: string): boolean {
  const text = message.toLowerCase();
  return /limit:\s*0\b/.test(text)
    || text.includes("no longer available")
    || text.includes("model not found")
    || text.includes("model is not found");
}

export function chooseGeminiModel(models: string[]): string | null {
  const usable = models.filter((name) =>
    name.startsWith("gemini-")
    && !/embedding|imagen|veo|tts|live|image/.test(name),
  );
  if (!usable.length) return null;

  const score = (name: string) => {
    const version = Number(/(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0);
    let points = version * 10;
    if (name.includes("flash")) points += 5;
    if (name.includes("lite")) points += 1;
    if (/preview|exp|experimental/.test(name)) points -= 8;
    if (name.includes("pro")) points -= 2;
    return points;
  };

  return usable.slice().sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function listGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(`${AI_ENDPOINTS.GEMINI_BASE}?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return [];

    const body = await response.json() as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    return (body.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => (model.name ?? "").replace(/^models\//, ""))
      .filter((name) => name.length > 0)
      .sort();
  } catch {
    return [];
  }
}

export type ProviderProbe = {
  name: string;
  envVar: string;
  selected: boolean;
  configured: boolean;
  reachable: boolean | null;
  detail: string;
  models?: string[];
  model?: string;
  raw: string | null;
};

const PROBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
};

export async function probeProviders(): Promise<ProviderProbe[]> {
  const selected = getSelectedProvider();
  const request: StructuredRequest = {
    workload: "fast",
    schemaName: "sartho_provider_probe",
    system: "Reply with the JSON object {\"ok\": true} and nothing else.",
    prompt: "ok",
    schema: PROBE_SCHEMA,
  };

  const configured = [
    {
      id: "gemini" as const,
      name: "Gemini",
      envVar: "GEMINI_API_KEY",
      key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_MODEL || process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite",
    },
    {
      id: "anthropic" as const,
      name: "Anthropic",
      envVar: "ANTHROPIC_API_KEY",
      key: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5",
    },
    {
      id: "openai" as const,
      name: "OpenAI",
      envVar: "OPENAI_API_KEY",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna",
    },
  ];

  return Promise.all(configured.map(async (provider): Promise<ProviderProbe> => {
    const isSelected = provider.id === selected;
    if (!provider.key) {
      return {
        name: provider.name, envVar: provider.envVar, selected: isSelected,
        configured: false, reachable: null, model: provider.model,
        detail: `${provider.envVar} is not set on this deployment`, raw: null,
      };
    }
    if (!isSelected) {
      return {
        name: provider.name, envVar: provider.envVar, selected: false,
        configured: true, reachable: null, model: provider.model,
        detail: "standby configured; not probed", raw: null,
      };
    }
    if (provider.id === "gemini" && process.env.GEMINI_DATA_TIER?.toLowerCase() !== "paid") {
      return {
        name: provider.name, envVar: provider.envVar, selected: isSelected,
        configured: true, reachable: false, model: provider.model,
        detail: "disabled until GEMINI_DATA_TIER=paid confirms paid-service data handling",
        raw: null,
      };
    }

    try {
      if (provider.id === "gemini") await callGemini(request, provider.key, provider.model);
      else if (provider.id === "anthropic") await callAnthropic(request, provider.key, provider.model);
      else await callOpenAI(request, provider.key, provider.model);
      return {
        name: provider.name, envVar: provider.envVar, selected: isSelected,
        configured: true, reachable: true, model: provider.model, detail: "answered", raw: null,
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "failed";
      const probe: ProviderProbe = {
        name: provider.name, envVar: provider.envVar, selected: isSelected,
        configured: true, reachable: false, model: provider.model,
        detail: shortAiFailure(message), raw: message,
      };
      if (provider.id === "gemini") probe.models = await listGeminiModels(provider.key);
      return probe;
    }
  }));
}
