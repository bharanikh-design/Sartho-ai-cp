import { describe, expect, it } from "vitest";
import { jobInputSchema } from "./route";

const valid = {
  title: "Transformation Director",
  employer: "Example Ltd",
  location: "Singapore",
  sourceUrl: "https://example.com/jobs/123",
  description: "A".repeat(160),
};

describe("job input boundary", () => {
  it("accepts a bounded role with an HTTPS source", () => {
    expect(jobInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-HTTPS and oversized input", () => {
    expect(jobInputSchema.safeParse({ ...valid, sourceUrl: "http://example.com/job" }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...valid, description: "A".repeat(80_001) }).success).toBe(false);
  });
});
