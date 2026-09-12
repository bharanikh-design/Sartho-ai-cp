import { afterEach, describe, expect, it } from "vitest";
import { strictSafeSchema } from "./schema";
import { geminiOutputBudget } from "./provider";
import { RESUME_EXTRACTION_SCHEMA } from "@/lib/resume/extraction-schema";

/*
 * The failure this exists for: building a tailored résumé returned "Sartho's AI
 * provider could not finish that request" every single time on an OpenAI
 * deployment, because its schema asks for minItems and strict structured
 * outputs answer 400 to anything outside their subset.
 */
describe("strictSafeSchema", () => {
  it("removes the array constraints strict mode refuses", () => {
    const cleaned = strictSafeSchema({
      type: "object",
      properties: {
        sections: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
      },
    });

    const sections = (cleaned.properties as { sections: Record<string, unknown> }).sections;
    expect(sections.minItems).toBeUndefined();
    expect(sections.maxItems).toBeUndefined();
    expect(sections.items).toEqual({ type: "string" });
  });

  it("reaches constraints nested inside arrays of objects", () => {
    const cleaned = JSON.stringify(strictSafeSchema({
      type: "object",
      properties: {
        experience: {
          type: "array",
          items: {
            type: "object",
            properties: { bullets: { type: "array", minItems: 1, items: { type: "string", minLength: 3 } } },
          },
        },
      },
    }));

    expect(cleaned).not.toContain("minItems");
    expect(cleaned).not.toContain("minLength");
  });

  /* Structure is the whole point of the schema; only the refused keywords go. */
  it("keeps everything strict mode does accept", () => {
    const cleaned = strictSafeSchema({
      type: "object",
      additionalProperties: false,
      required: ["a", "b"],
      description: "kept",
      properties: {
        a: { type: "string", enum: ["x", "y"], description: "also kept" },
        b: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    });

    expect(cleaned).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["a", "b"],
      description: "kept",
      properties: {
        a: { type: "string", enum: ["x", "y"], description: "also kept" },
        b: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    });
  });

  /* Schemas are module constants; a shared object edited in place is a trap. */
  it("does not mutate the schema it was given", () => {
    const original = { type: "array", minItems: 1, items: { type: "string" } };
    strictSafeSchema(original);
    expect(original.minItems).toBe(1);
  });

  /*
   * The real ones, so this cannot pass on a toy and fail on the schema that
   * broke. The extractor carries maxItems in four places.
   */
  it("clears the résumé extraction schema", () => {
    const cleaned = JSON.stringify(strictSafeSchema(RESUME_EXTRACTION_SCHEMA));
    expect(JSON.stringify(RESUME_EXTRACTION_SCHEMA)).toContain("maxItems");
    expect(cleaned).not.toContain("maxItems");
    expect(cleaned).toContain("totalExperienceYears");
  });

  it("survives nulls and primitives without inventing structure", () => {
    expect(strictSafeSchema(null)).toBeNull();
    expect(strictSafeSchema("string")).toBe("string");
    expect(strictSafeSchema(7)).toBe(7);
  });
});

/*
 * The budget was a ternary whose two branches were the same number, under a
 * comment explaining that the larger allowance was scoped to one workload. It
 * gave 8192 to everything — including the tailored résumé draft, the largest
 * document Sartho asks for, which stops mid-object at that ceiling and fails.
 */
describe("geminiOutputBudget", () => {
  afterEach(() => { delete process.env.GEMINI_MAX_OUTPUT_TOKENS; });

  /*
   * 8192 stays the default because provider.test.ts calls it the model's legal
   * limit — a claim about the API, not a preference. Sending more than a model
   * accepts is refused outright, which would take down every call rather than
   * the one long document.
   */
  it("keeps the documented default", () => {
    expect(geminiOutputBudget()).toBe(8_192);
  });

  it("lets a deployment that knows its model's limit raise it", () => {
    process.env.GEMINI_MAX_OUTPUT_TOKENS = "65536";
    expect(geminiOutputBudget()).toBe(65_536);
  });

  it("ignores a value that is not a usable number", () => {
    for (const bad of ["not a number", "0", "-1", ""]) {
      process.env.GEMINI_MAX_OUTPUT_TOKENS = bad;
      expect(geminiOutputBudget()).toBe(8_192);
    }
  });
});
