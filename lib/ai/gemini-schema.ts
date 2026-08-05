/*
 * The extraction schema, translated into the dialect Gemini accepts.
 *
 * Gemini's responseSchema is a subset of OpenAPI 3.0, not JSON Schema, and it
 * differs in exactly the two places this schema uses most:
 *
 *   - additionalProperties is not a field it knows. Sent anyway, the request is
 *     rejected outright.
 *   - a nullable field is `type: "string", nullable: true`, not
 *     `type: ["string", "null"]`. This is the one that matters: get it wrong
 *     and the request may still succeed while the model, with no way to say
 *     "absent", writes an empty string where a date or an employer should have
 *     been missing. Sartho would then record a blank as though it were a fact
 *     read off the page, which is the single thing the product promises never
 *     to do.
 *
 * Translating rather than maintaining a second schema keeps one definition of
 * what a résumé extraction is, and keeps every provider held to it.
 */

type JsonSchema = Record<string, unknown>;

const CARRIED = ["description", "enum", "maxItems", "minItems", "format"] as const;

export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};

  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    const concrete = rawType.filter((entry) => entry !== "null");
    if (concrete.length !== 1) {
      throw new Error(`Gemini cannot express a union of ${rawType.join(", ")}.`);
    }
    out.type = concrete[0];
    if (rawType.length !== concrete.length) out.nullable = true;
  } else if (rawType !== undefined) {
    out.type = rawType;
  }

  if (schema.nullable === true) out.nullable = true;

  for (const key of CARRIED) {
    if (schema[key] !== undefined) out[key] = schema[key];
  }

  if (schema.properties && typeof schema.properties === "object") {
    const properties = schema.properties as Record<string, JsonSchema>;
    const names = Object.keys(properties);

    out.properties = Object.fromEntries(
      names.map((name) => [name, toGeminiSchema(properties[name])]),
    );
    /*
     * propertyOrdering used to be set here so two runs over one document came
     * back in the same order. It is the least standard field in this request
     * and worth exactly nothing next to the request being accepted, so it goes.
     * Ordering is a comparison convenience; being read at all is the product.
     */
    if (Array.isArray(schema.required)) out.required = schema.required;
  }

  if (schema.items && typeof schema.items === "object") {
    out.items = toGeminiSchema(schema.items as JsonSchema);
  }

  return out;
}
