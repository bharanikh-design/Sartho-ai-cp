import { describeProviderFailures, shortAiFailure } from "./failure";
import { toGeminiSchema } from "./gemini-schema";

type StructuredRequest = {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
};

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("The AI provider did not return valid JSON.");
  return trimmed.slice(first, last + 1);
}

async function callOpenAI(request: StructuredRequest, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5",
      store: false,
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
  });

  const result = await response.json() as {
    error?: { message?: string };
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (!response.ok) throw new Error(result.error?.message ?? "OpenAI request failed.");

  const text = result.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")
    ?.text;
  if (!text) throw new Error("OpenAI returned no structured output.");
  return JSON.parse(extractJson(text)) as unknown;
}

async function callAnthropic(request: StructuredRequest, apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // Overridable with ANTHROPIC_MODEL; the default tracks the current family.
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 7000,
      temperature: 0,
      system: `${request.system}\nReturn only one JSON object matching this JSON Schema:\n${JSON.stringify(request.schema)}`,
      messages: [{ role: "user", content: request.prompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const result = await response.json() as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };
  if (!response.ok) throw new Error(result.error?.message ?? "Anthropic request failed.");
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no structured output.");
  return JSON.parse(extractJson(text)) as unknown;
}

/*
 * Gemini, on Google's free tier.
 *
 * The key goes in a header rather than the query string so it never lands in a
 * URL, a log line or a referrer. The schema is translated first — Gemini speaks
 * an OpenAPI subset, not JSON Schema — and the finish reason is checked before
 * the body is parsed, because a response cut short at the token ceiling is
 * truncated JSON, and "unexpected end of input" is a useless thing to hand
 * someone who uploaded a long CV.
 */
async function callGemini(request: StructuredRequest, apiKey: string) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 32_768,
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(request.schema),
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  const result = await response.json() as {
    error?: { message?: string };
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(result.error?.message ?? "Gemini request failed.");

  const candidate = result.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("The document produced more detail than one reply can hold. Try a shorter résumé.");
  }
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new Error("The provider declined to process that document.");
  }

  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no structured output.");
  return JSON.parse(extractJson(text)) as unknown;
}

/*
 * Three providers, tried in order — not one provider and a spare that never gets
 * used.
 *
 * This previously picked Anthropic only when OPENAI_API_KEY was *absent*, which
 * is the one case that almost never happens. The case that does happen is a key
 * that is present and an account behind it that has run out of credit: every
 * import then failed at the model call with a billing error, while a perfectly
 * good second key sat in the environment untouched. A configured provider that
 * cannot be reached is not a configured provider, so a failure moves on to the
 * next one and every failure is reported.
 *
 * Gemini leads because it is the one with a free tier — a deployment that sets
 * all three should exhaust what costs nothing before it starts spending. The
 * order is cheapest-first, not best-first, and every provider is held to the
 * same schema, so which one answered is not visible in the result.
 */
export async function generateStructuredJson(request: StructuredRequest) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  const providers: Array<{ name: string; run: () => Promise<unknown> }> = [];
  if (geminiKey) providers.push({ name: "Gemini", run: () => callGemini(request, geminiKey) });
  if (anthropicKey) providers.push({ name: "Anthropic", run: () => callAnthropic(request, anthropicKey) });
  if (openAIKey) providers.push({ name: "OpenAI", run: () => callOpenAI(request, openAIKey) });

  if (!providers.length) {
    throw new Error("No server-side AI provider is configured. Add GEMINI_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel.");
  }

  /*
   * Every failure is kept, not just the last one. Which providers were tried is
   * as much of the answer as why they failed — a message naming only the final
   * provider cannot say whether the one ahead of it was even configured.
   */
  const failures: Array<{ provider: string; message: string }> = [];
  for (const provider of providers) {
    try {
      return await provider.run();
    } catch (caught) {
      failures.push({
        provider: provider.name,
        message: caught instanceof Error ? caught.message : "failed for an unknown reason",
      });
    }
  }

  throw new Error(describeProviderFailures(failures));
}

/*
 * Which providers are configured, and does each one actually answer.
 *
 * Built after an afternoon of not being able to tell the difference between a
 * key that was never read, a key that was rejected, and an account with no
 * money in it — all three of which surface to someone uploading a CV as the
 * same failed import. Guessing at that from the outside is what turns a
 * five-minute fix into a day.
 *
 * The probe sends the smallest request each provider will accept. It never
 * returns a key, or any part of one.
 */
/*
 * The models this key may actually call.
 *
 * A quota error naming "limit: 0" for one model is not an exhausted account —
 * it is an account that was never given an allowance for that model, usually
 * because Google has moved the free tier on to a newer one. The fix is a
 * different model name, and guessing at model names is what produced the
 * problem in the first place. So the key is asked.
 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
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
  configured: boolean;
  reachable: boolean | null;
  detail: string;
  /* Set only when the provider can say which models the key may call. */
  models?: string[];
  /* The model this deployment is configured to use. */
  model?: string;
  /*
   * The provider's own words, kept alongside the summary.
   *
   * "no credit left" is the right thing to tell someone uploading a CV and the
   * wrong thing to tell whoever has to fix it: an account that is empty, a
   * project without billing enabled and a region the free tier does not cover
   * all summarise to the same three words, and only the raw text says which.
   * This page is read by the person holding the keys, so it gets both.
   */
  raw: string | null;
};

const PROBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
};

export async function probeProviders(): Promise<ProviderProbe[]> {
  const configured = [
    { name: "Gemini", envVar: "GEMINI_API_KEY", key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, call: callGemini },
    { name: "Anthropic", envVar: "ANTHROPIC_API_KEY", key: process.env.ANTHROPIC_API_KEY, call: callAnthropic },
    { name: "OpenAI", envVar: "OPENAI_API_KEY", key: process.env.OPENAI_API_KEY, call: callOpenAI },
  ];

  const request: StructuredRequest = {
    schemaName: "sartho_provider_probe",
    system: "Reply with the JSON object {\"ok\": true} and nothing else.",
    prompt: "ok",
    schema: PROBE_SCHEMA,
  };

  return Promise.all(
    configured.map(async ({ name, envVar, key, call }): Promise<ProviderProbe> => {
      if (!key) {
        return { name, envVar, configured: false, reachable: null, detail: `${envVar} is not set on this deployment`, raw: null };
      }
      try {
        await call(request, key);
        return { name, envVar, configured: true, reachable: true, detail: "answered", raw: null };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "failed";
        const probe: ProviderProbe = {
          name, envVar, configured: true, reachable: false,
          detail: shortAiFailure(message), raw: message,
        };

        /*
         * "limit: 0" means no allowance was ever granted for this model, not
         * that one was spent — so the useful next step is a different model,
         * and the key itself can say which are available.
         */
        if (name === "Gemini") {
          probe.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
          if (/limit:\s*0\b/.test(message)) probe.models = await listGeminiModels(key);
        }
        return probe;
      }
    }),
  );
}
