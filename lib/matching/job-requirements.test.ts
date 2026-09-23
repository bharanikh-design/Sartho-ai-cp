import { describe, expect, it } from "vitest";
import { extractJobRequirements } from "./job-requirements";

describe("weighted job requirements", () => {
  it("separates mandatory, important and preferred requirements", () => {
    const result = extractJobRequirements(`
      You must have business analysis experience.
      Experience leading project delivery programmes.
      Kubernetes is desirable.
    `);
    expect(result.find((item) => item.capability === "Business analysis")?.importance).toBe("mandatory");
    expect(result.find((item) => item.capability === "Kubernetes")?.importance).toBe("preferred");
    expect(result.find((item) => item.capability === "ServiceNow")?.evidenceText).toContain("must");
  });
});
