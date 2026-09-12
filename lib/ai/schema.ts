/*
 * Making a JSON Schema safe for OpenAI's strict structured outputs.
 *
 * Strict mode accepts a subset of JSON Schema and returns HTTP 400 for anything
 * outside it — "In context=('properties','sections'), 'minItems' is not
 * permitted". That sentence contains none of the words classifyAiFailure looks
 * for, so it was read as an unrecognised provider fault and reached the person
 * as "Sartho's AI provider could not finish that request", which names nothing
 * anybody can act on.
 *
 * The résumé draft schema asks for minItems on three arrays, so building a
 * tailored résumé failed every single time on an OpenAI deployment. Four other
 * schemas carry the same keywords — the résumé extractor, the search keyword
 * expander, and both career-direction calls — and two of those swallow their
 * failure and quietly fall back, which is why nobody noticed.
 *
 * Stripping rather than rewriting the schemas is deliberate. These constraints
 * are real intent and belong in the Zod parse that already runs on the other
 * side of the call, where they are enforced rather than merely requested — the
 * models were never going to honour them anyway, since strict mode ignores the
 * ones it does accept.
 */

/*
 * Everything strict mode rejects. Kept as one list rather than a per-keyword
 * check so the next addition is a one-line change instead of a new branch.
 */
const UNSUPPORTED = new Set([
  "minItems", "maxItems", "uniqueItems", "contains", "minContains", "maxContains",
  "minLength", "maxLength", "pattern", "format",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minProperties", "maxProperties", "patternProperties", "propertyNames",
  "default", "examples", "dependentRequired", "dependentSchemas",
]);

/**
 * The same schema with every keyword strict mode refuses removed, recursively.
 * The original is never mutated: callers keep schemas as module constants and a
 * shared object edited in place would change under the next caller.
 */
export function strictSafeSchema<T>(schema: T): T {
  if (Array.isArray(schema)) {
    return schema.map((entry) => strictSafeSchema(entry)) as unknown as T;
  }
  if (!schema || typeof schema !== "object") return schema;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (UNSUPPORTED.has(key)) continue;
    output[key] = strictSafeSchema(value);
  }
  return output as unknown as T;
}
