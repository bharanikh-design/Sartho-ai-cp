import { describe, expect, it } from "vitest";
import { toGeminiSchema } from "./gemini-schema";

/*
 * The nullability cases are the ones that earn this file. A schema Gemini
 * rejects fails loudly and gets fixed; a schema it accepts while losing the
 * ability to say "this was not in the document" fails silently, and Sartho
 * records a blank as a fact.
 */

describe("toGeminiSchema", () => {
  it("drops additionalProperties, which Gemini rejects outright", () => {
    const out = toGeminiSchema({
      type: "object",
      additionalProperties: false,
      properties: { employer: { type: "string" } },
      required: ["employer"],
    });

    expect(out).not.toHaveProperty("additionalProperties");
    expect(out.required).toEqual(["employer"]);
  });

  it("turns a nullable union into a type with a nullable flag", () => {
    expect(toGeminiSchema({ type: ["string", "null"] })).toEqual({
      type: "string",
      nullable: true,
    });
    expect(toGeminiSchema({ type: ["number", "null"] })).toEqual({
      type: "number",
      nullable: true,
    });
  });

  it("leaves a plain type alone and does not mark it nullable", () => {
    expect(toGeminiSchema({ type: "string" })).toEqual({ type: "string" });
    expect(toGeminiSchema({ type: "boolean" }).nullable).toBeUndefined();
  });

  it("converts nullability at every depth, not just the top", () => {
    const out = toGeminiSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        roles: {
          type: "array",
          maxItems: 40,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              employer: { type: "string" },
              endDate: { type: ["string", "null"] },
            },
            required: ["employer", "endDate"],
          },
        },
      },
    });

    const roles = out.properties as Record<string, Record<string, unknown>>;
    const items = roles.roles.items as Record<string, Record<string, unknown>>;
    const props = items.properties as Record<string, Record<string, unknown>>;

    expect(roles.roles.maxItems).toBe(40);
    expect(items).not.toHaveProperty("additionalProperties");
    expect(props.endDate).toEqual({ type: "string", nullable: true });
    expect(props.employer).toEqual({ type: "string" });
  });

  it("keeps an enum, because confidence is a closed set", () => {
    expect(toGeminiSchema({ type: "string", enum: ["low", "medium", "high"] })).toEqual({
      type: "string",
      enum: ["low", "medium", "high"],
    });
  });

  it("fixes the key order so two runs over one document are comparable", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { employer: { type: "string" }, title: { type: "string" } },
    });
    expect(out.propertyOrdering).toEqual(["employer", "title"]);
  });

  it("refuses a union it cannot express rather than silently picking one", () => {
    expect(() => toGeminiSchema({ type: ["string", "number"] })).toThrow(/union/i);
  });

  it("produces a schema with no JSON Schema keywords Gemini would reject", () => {
    const converted = JSON.stringify(
      toGeminiSchema({
        type: "object",
        additionalProperties: false,
        properties: {
          metrics: { type: "array", maxItems: 8, items: { type: "string" } },
          location: { type: ["string", "null"] },
        },
        required: ["metrics", "location"],
      }),
    );

    expect(converted).not.toContain("additionalProperties");
    expect(converted).not.toContain('"null"');
  });
});
