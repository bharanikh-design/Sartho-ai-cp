import { describe, expect, it } from "vitest";
import { extractJobRequirements } from "./job-requirements";

describe("weighted job requirements", () => {
  it("separates mandatory, important and preferred requirements", () => {
    const result = extractJobRequirements(`
      You must have ServiceNow experience.
      Experience leading transformation programmes.
      Kubernetes is desirable.
    `);
    expect(result.find((item) => item.capability === "ServiceNow")?.importance).toBe("mandatory");
    expect(result.find((item) => item.capability === "Kubernetes")?.importance).toBe("preferred");
    expect(result.find((item) => item.capability === "ServiceNow")?.evidenceText).toContain("must");
  });
});
