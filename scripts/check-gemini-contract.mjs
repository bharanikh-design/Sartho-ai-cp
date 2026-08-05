/*
 * Does Gemini still accept the request we send it?
 *
 * The unit tests prove the schema translator turns our JSON Schema into
 * Gemini's dialect. They cannot prove Gemini agrees — that is a contract with
 * a service that can change under us, and the failure mode is a live import
 * breaking for every user at once.
 *
 * This asks the real API. It needs no valid key: Google validates the request
 * body before it validates credentials, so a well-formed request fails on
 * API_KEY_INVALID while a malformed one is rejected field by field. Both
 * outcomes are informative, and the difference between them is the test.
 *
 *   node scripts/check-gemini-contract.mjs          # the shipped request
 *   node scripts/check-gemini-contract.mjs --raw    # control: untranslated
 *
 * A real GEMINI_API_KEY in the environment turns it into a full round trip.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const CONTROL = process.argv.includes("--raw");
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const KEY = process.env.GEMINI_API_KEY || "AIza-deliberately-invalid-shape-probe";

/* The schema the route actually sends, read from the route rather than copied. */
const source = readFileSync("app/api/career/import/route.ts", "utf8");
const from = source.indexOf("const jsonSchema = {");
const to = source.indexOf("\n};", from) + 3;
const jsonSchema = eval(`(${source.slice(from + "const jsonSchema =".length, to).trim().replace(/;$/, "")})`);

execSync(
  "npx tsc lib/ai/gemini-schema.ts --outDir .gemini-probe --module esnext --target es2022 --moduleResolution bundler --ignoreConfig",
  { stdio: "pipe" },
);
const { toGeminiSchema } = await import("../.gemini-probe/gemini-schema.js");

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "You are Sartho's evidence extractor." }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ resumeText: "BARCLAYS — Head of EUC, 2019 to present. Cut incidents 40%." }) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 32_768,
        responseMimeType: "application/json",
        responseSchema: CONTROL ? jsonSchema : toGeminiSchema(jsonSchema),
      },
    }),
  },
);

const payload = await response.json();
const message = payload?.error?.message ?? "";
const reason = payload?.error?.details?.[0]?.reason ?? "";

console.log(`${CONTROL ? "control (untranslated)" : "shipped (translated)"} → HTTP ${response.status} ${reason}`);

if (CONTROL) {
  const rejected = /Unknown name|Cannot find field|not repeating/.test(message);
  console.log(rejected
    ? "PASS — Gemini still rejects raw JSON Schema, so the translation is load-bearing."
    : "CHECK — Gemini accepted raw JSON Schema. The translator may no longer be needed.");
  process.exit(rejected ? 0 : 1);
}

if (response.ok) {
  console.log("PASS — full round trip, schema accepted and answered.");
  process.exit(0);
}
if (reason === "API_KEY_INVALID") {
  console.log("PASS — request accepted, rejected only on credentials. Shape is good.");
  process.exit(0);
}
console.log(`FAIL — the request itself was rejected:\n${message}`);
process.exit(1);
