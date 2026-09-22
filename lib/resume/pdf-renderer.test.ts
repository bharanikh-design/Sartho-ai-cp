import { describe, expect, it } from "vitest";
import { ResumePdfRenderer } from "@/components/resume-pdf-templates";
import { emptyContent } from "@/lib/resume/content";

describe("grouped skills and certifications on the page", () => {
  it("render on the Systems and Engineering templates without throwing", async () => {
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { ResumePdfRenderer } = await import("@/components/resume-pdf-templates");
    const { emptyContent } = await import("@/lib/resume/content");
    const React = await import("react");
    for (const template of ["systems", "engineering"] as const) {
      const content = {
        ...emptyContent(),
        template,
        name: "A Person",
        summary: "Engineer.",
        roles: [{ id: "r0", title: "Engineer", employer: "Co", location: "", start: "2020", end: "", current: true, bullets: [{ id: "b", text: "Shipped a thing to 10 plants.", evidenceIds: [], edited: false }] }],
        skillGroups: [{ id: "sg0", name: "Standards", skills: ["ISO 26262", "ASPICE"] }],
        certifications: [{ id: "c0", name: "Functional Safety Engineer", issuer: "TÜV SÜD", year: "2023" }],
      };
      const bytes = await renderToBuffer(React.createElement(ResumePdfRenderer, { content }) as never);
      expect(bytes.byteLength).toBeGreaterThan(1000);
    }
  });
});
