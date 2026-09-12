import { createHash } from "node:crypto";
import { classifyAiFailure, describeAiFailure, shortAiFailure } from "./failure";
import { strictSafeSchema } from "./schema";
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
      ? process.env.OPENAI_FAST_MODEL || "gpt-4o-mini"
      : process.env.OPENAI_QUALITY_MODEL || "gpt-4o");
    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim()
      || (legacyModel ? null : workload === "fast" ? "gpt-4o" : "gpt-4o");

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

    const legacyModel = usableGeminiModel(process.env.GEMINI_MODEL);
    const primaryModel = legacyModel || (workload === "fast"
      ? usableGeminiModel(process.env.GEMINI_FAST_MODEL) || "gemini-3.5-flash-lite"
      : usableGeminiModel(process.env.GEMINI_QUALITY_MODEL) || "gemini-3.6-flash");
    const fallbackModel = usableGeminiModel(process.env.GEMINI_FALLBACK_MODEL)
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
    ? process.env.ANTHROPIC_FAST_MODEL || "claude-3-haiku-20240307"
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
            /*
             * Strict mode 400s on any keyword outside its subset, so the schema
             * is filtered rather than sent as written. What the keywords asked
             * for is enforced by the Zod parse on the way back, which is the
             * only place it was ever actually checked.
             */
            schema: strictSafeSchema(request.schema),
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

/*
 * How much room one reply gets.
 *
 * This was a ternary whose two branches held the same number, under a comment
 * explaining that the larger allowance was scoped to the résumé workload while
 * every other request kept a tighter guardrail. It did neither — everything got
 * 8192 — and the comment described an intention nobody had implemented.
 *
 * The number stays, because a test calls 8192 the model's legal limit and that
 * is a claim about the API rather than a preference: sending more than a model
 * accepts is refused outright, which would take down every call rather than the
 * one long document. Raising it belongs to whoever can check their model's
 * published output limit, which is what the environment variable is for.
 *
 * What changes is that hitting the ceiling is no longer silent. The tailored
 * résumé is the largest thing Sartho asks for — a summary, every bullet of
 * every role, a UUID citation list beside each one, and a change log explaining
 * every edit — and when it overran, Gemini reported MAX_TOKENS, the message
 * matched no classifier pattern, and the person was told to try again.
 */
const GEMINI_DEFAULT_OUTPUT_TOKENS = 8_192;

export function geminiOutputBudget(): number {
  const configured = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return GEMINI_DEFAULT_OUTPUT_TOKENS;
}

async function callGemini(request: StructuredRequest, apiKey: string, model: string) {
  const maxOutputTokens = geminiOutputBudget();

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
      "The reply hit its output token ceiling before the document was finished, so what came back was incomplete. This is a limit in Sartho's configuration, not a problem with the résumé; GEMINI_MAX_OUTPUT_TOKENS raises it.",
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
 * model moves to the configured fallback inside the same provider, or — for
 * Gemini with no fallback — to a model the same key still lists. No résumé
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
      if (caught.retryKind === "model_unavailable") {
        const recovery = route.fallbackModel
          ?? (route.provider === "gemini"
            ? await recoverGeminiModel(route.key, route.primaryModel)
            : null);
        if (recovery) return await callRoute(request, route, recovery);
      }
    } catch (retryFailure) {
      const msg = retryFailure instanceof Error ? retryFailure.message : "fallback failed";
      throw new Error(await spokenFailure(route, msg));
    }

    throw new Error(await spokenFailure(route, caught.message));
  }
}

/*
 * The failure, said to a person — with the engineering detail logged, not
 * printed.
 *
 * This used to append " [DIAGNOSTIC: Available models for your key: ...]" to
 * the message it returned, which is how a bracketed list of Gemini model names
 * came to be rendered inside a red box on the opportunity page. Worse, when the
 * key could list nothing the bracket was simply empty — so the one thing on
 * screen that looked like a clue was a dangling label with nothing after it.
 *
 * describeAiFailure exists precisely to keep provider internals out of the
 * product. Appending diagnostics to its output defeated the whole point of it.
 * The list still gets fetched, because it is genuinely the most useful thing to
 * know when Gemini fails — it just goes to the server log where the person who
 * can act on it will look.
 *
 * And an empty list is itself the signal. A key that can list no models at all
 * is not a key with a retired model on it; it is a key that is invalid, or
 * whose Google Cloud project does not have the Generative Language API turned
 * on. That is said plainly rather than left as a blank bracket.
 */
async function spokenFailure(route: ProviderRoute, rawMessage: string): Promise<string> {
  if (route.provider !== "gemini") {
    console.error("AI provider failed", { provider: route.provider, message: rawMessage });
    return describeAiFailure(rawMessage);
  }

  let models: string[] = [];
  let listFailed: string | null = null;
  try {
    models = await listGeminiModels(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "");
  } catch (caught) {
    listFailed = caught instanceof Error ? caught.message : "could not list models";
  }

  console.error("AI provider failed", {
    provider: "gemini",
    message: rawMessage,
    availableModels: models.length ? models.join(", ") : "(none)",
    listModelsError: listFailed,
  });

  /*
   * Only when nothing else already explains it. A recognised failure — no
   * credit, a rejected key, a rate limit — has its own sentence naming the
   * lever, and that is more useful than this one.
   */
  if (!models.length && classifyAiFailure(rawMessage) === "unknown") {
    return "Sartho's AI provider rejected the request and its key can list no models at all, which means the key is not valid or the Generative Language API is not enabled for its Google Cloud project. Nothing is wrong with your data. The administrator needs to check GEMINI_API_KEY and that the API is enabled for that project.";
  }
  return describeAiFailure(rawMessage);
}

/*
 * Google shut Gemini 1.5 down in 2025. A deployment that still has
 * GEMINI_MODEL=gemini-1.5-pro treats that pin as gospel and skips fallback,
 * which is how résumé import started failing with a model-not-found error
 * that named a model nobody should still be asking for.
 */
export function isRetiredGeminiModel(name: string): boolean {
  const id = name.trim().toLowerCase().replace(/^models\//, "");
  return id === "gemini-pro"
    || id.startsWith("gemini-pro-")
    || id.startsWith("gemini-1.0")
    || id.startsWith("gemini-1.5");
}

function usableGeminiModel(value: string | undefined): string | undefined {
  const name = value?.trim();
  if (!name || isRetiredGeminiModel(name)) return undefined;
  return name;
}

export function isGeminiModelUnavailable(message: string): boolean {
  const text = message.toLowerCase();
  return /limit:\s*0\b/.test(text)
    || text.includes("no longer available")
    || text.includes("model not found")
    || text.includes("model is not found")
    || text.includes("is not found for api version")
    || text.includes("not supported for generatecontent");
}

export function chooseGeminiModel(models: string[]): string | null {
  const usable = models.filter((name) =>
    name.startsWith("gemini-")
    && !isRetiredGeminiModel(name)
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

async function recoverGeminiModel(apiKey: string, failedModel: string) {
  const available = await listGeminiModels(apiKey);
  return chooseGeminiModel(available.filter((name) => name !== failedModel));
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

export type GeminiModelLimit = {
  name: string;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
};

/*
 * What each Gemini model will actually accept and produce.
 *
 * The models endpoint reports both ceilings and listGeminiModels was throwing
 * them away, so the one number needed to size GEMINI_MAX_OUTPUT_TOKENS — the
 * limit of the model this deployment is really calling — was only findable by
 * reading Google's documentation and hoping it matched the model in the
 * environment variable. It is reported by the API; it should be read from
 * there.
 */
export async function listGeminiModelLimits(apiKey: string): Promise<GeminiModelLimit[]> {
  try {
    const response = await fetch(`${AI_ENDPOINTS.GEMINI_BASE}?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return [];

    const body = await response.json() as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
        inputTokenLimit?: number;
        outputTokenLimit?: number;
      }>;
    };
    return (body.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => ({
        name: (model.name ?? "").replace(/^models\//, ""),
        inputTokenLimit: model.inputTokenLimit ?? null,
        outputTokenLimit: model.outputTokenLimit ?? null,
      }))
      .filter((model) => model.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
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
      model: usableGeminiModel(process.env.GEMINI_MODEL)
        || usableGeminiModel(process.env.GEMINI_FAST_MODEL)
        || "gemini-3.5-flash-lite",
    },
    {
      id: "anthropic" as const,
      name: "Anthropic",
      envVar: "ANTHROPIC_API_KEY",
      key: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_FAST_MODEL || "claude-3-haiku-20240307",
    },
    {
      id: "openai" as const,
      name: "OpenAI",
      envVar: "OPENAI_API_KEY",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || process.env.OPENAI_FAST_MODEL || "gpt-4o-mini",
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
