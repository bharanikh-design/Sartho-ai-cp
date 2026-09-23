import { describe, expect, it } from "vitest";
import { discoverCareersSource } from "./discovery";

describe("careers source discovery", () => {
  it("recognises Workday URLs", () => {
    const result = discoverCareersSource("https://example.myworkdayjobs.com/en-US/Careers");
    expect(result.kind).toBe("workday");
    expect(result.tenant).toBe("example");
    expect(result.site).toBe("Careers");
  });
  it("recognises Greenhouse URLs", () => {
    expect(discoverCareersSource("https://boards.greenhouse.io/acme").kind).toBe("greenhouse");
  });
  it("recognises Lever URLs", () => {
    expect(discoverCareersSource("https://jobs.lever.co/acme").kind).toBe("lever");
  });
  it("does not pretend an unknown careers site is supported", () => {
    expect(discoverCareersSource("https://careers.example.com/jobs")).toMatchObject({ kind: "unknown", confidence: "unknown" });
  });
});
