import { describe, expect, it } from "vitest";
import { emptyContent } from "./content";
import { recommendTemplate } from "./template-recommendation";

describe("resume template recommendation", () => {
  it("recognises a mechanical engineer applying in the UK", () => {
    const content = {
      ...emptyContent(),
      targetRole: "Senior Mechanical Engineer",
      summary: "Mechanical engineering consultant delivering HVAC and infrastructure programmes.",
      skills: ["AutoCAD", "Revit", "ASME"],
    };
    const result = recommendTemplate(content, "uk");
    expect(result.template).toBe("engineering");
    expect(result.reasons.join(" ")).toContain("engineering-led");
  });

  it("recommends systems for a US technology profile", () => {
    const content = { ...emptyContent(), targetRole: "Platform Engineer", skills: ["AWS", "Kubernetes", "DevOps"] };
    expect(recommendTemplate(content, "us").template).toBe("systems");
  });

  it("uses an executive layout for senior consulting leadership", () => {
    const content = { ...emptyContent(), targetRole: "Engagement Manager", summary: "Client engagement and transformation consulting leader." };
    expect(recommendTemplate(content, "sg").template).toBe("executive");
  });
});
