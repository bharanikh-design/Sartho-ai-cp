import { describe, expect, it } from "vitest";
import { RESUME_TEMPLATES } from "@/lib/resume/templates";

/*
 * What the old test here asserted was that a PDF came out larger than a
 * kilobyte. It did — and it was missing the person's certifications, their
 * grouped skills and every section they had written themselves, because the
 * renderer never read those fields. A test that only proves the renderer did
 * not throw is how a résumé goes out without its PE licence on it.
 *
 * So these read the file back with the same PDF reader the ATS Gate uses, and
 * assert the facts are on the page.
 */

type AnyContent = Record<string, unknown>;

async function renderPdf(content: AnyContent, pageSize?: "A4" | "LETTER"): Promise<Uint8Array> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ResumePdfRenderer } = await import("@/components/resume-pdf-templates");
  const React = await import("react");
  return renderToBuffer(React.createElement(ResumePdfRenderer, { content, pageSize } as never) as never);
}

async function textOf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(document, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

async function fixture(template: string): Promise<AnyContent> {
  const { emptyContent } = await import("@/lib/resume/content");
  return {
    ...emptyContent(),
    template,
    name: "Priya Raman",
    targetRole: "Functional Safety Engineer",
    summary: "Engineer with a decade on safety-critical vehicle platforms.",
    contact: { email: "priya@example.com", phone: "+65 9000 0000", location: "Singapore", linkedin: "linkedin.com/in/priya", website: "" },
    roles: [{
      id: "r0", title: "Principal Engineer", employer: "Aurora Mobility", location: "Singapore",
      start: "2020", end: "", current: true,
      bullets: [{ id: "b0", text: "Took the braking platform through ISO 26262 ASIL-D sign-off.", evidenceIds: [], edited: false }],
    }],
    education: [{ id: "e0", qualification: "BEng Mechanical Engineering", institution: "NUS", year: "2012" }],
    skills: ["MATLAB", "Simulink"],
    skillGroups: [{ id: "sg0", name: "Standards", skills: ["ISO 26262", "ASPICE"] }],
    certifications: [{ id: "c0", name: "Functional Safety Engineer", issuer: "TUV SUD", year: "2023" }],
    sections: [{ id: "s0", heading: "Selected Projects", bullets: [{ id: "sb0", text: "Led the regional platform consolidation.", evidenceIds: [], edited: false }] }],
  };
}

describe("every template carries every fact onto the page", () => {
  for (const template of RESUME_TEMPLATES) {
    it(`${template.name} renders certifications, grouped skills and custom sections`, async () => {
      const text = await textOf(await renderPdf(await fixture(template.id)));
      /*
       * Compared without spacing or case: a template may set the name in
       * tracked capitals, and a tracked line extracts one glyph at a time.
       */
      const flat = text.replace(/\s+/g, "").toLowerCase();
      const has = (value: string) => flat.includes(value.replace(/\s+/g, "").toLowerCase());

      /* The three fields the previous renderer dropped entirely. */
      expect(has("Functional Safety Engineer"), "certification name").toBe(true);
      expect(has("Standards"), "skill group heading").toBe(true);
      expect(has("ISO 26262"), "grouped skill").toBe(true);
      expect(has("Selected Projects"), "custom section heading").toBe(true);

      /* And the ordinary ones, so a layout change cannot quietly drop them. */
      expect(has("Priya Raman"), "name").toBe(true);
      expect(has("Aurora Mobility"), "employer").toBe(true);
      expect(has("NUS"), "education").toBe(true);
      expect(has("priya@example.com"), "contact").toBe(true);

      /*
       * Section headings are the landmarks a parser navigates by, so they must
       * come back as words. Letterspacing renders each glyph at its own
       * position and an extractor reads "C E RT I F I C AT I O N S" — which is
       * how a heading stops being a heading to everything but a human.
       */
      const collapsed = text.replace(/[ \t]+/g, " ");
      expect(collapsed, `${template.name} heading is machine-readable`).toMatch(/certifications/i);
      expect(collapsed, `${template.name} heading is machine-readable`).toMatch(/experience/i);
    }, 30_000);
  }
});

describe("the template choice reaches the file", () => {
  /*
   * The reported failure: ten templates, two documents. Classic, Executive,
   * Editorial, Compact, Systems and Engineering were byte-identical, so what a
   * person picked and previewed was not what they downloaded.
   */
  it("gives every template a distinct document", async () => {
    const rendered = await Promise.all(
      RESUME_TEMPLATES.map(async (template) => ({
        id: template.id,
        bytes: (await renderPdf(await fixture(template.id))).byteLength,
      })),
    );

    const identical = rendered.filter((one) =>
      rendered.some((other) => other.id !== one.id && other.bytes === one.bytes));

    expect(identical.map((entry) => entry.id), "templates rendering identically").toEqual([]);
  }, 120_000);

  it("draws the two-column templates as two columns", async () => {
    /* Innovator and Atlas describe a sidebar and used to render one column. */
    const sidebar = RESUME_TEMPLATES.filter((template) => template.pdf.layout === "sidebar");
    expect(sidebar.length).toBeGreaterThan(0);

    for (const template of sidebar) {
      const text = await textOf(await renderPdf(await fixture(template.id)));
      /* Education and contact live in the sidebar on these templates. */
      expect(text, `${template.name} sidebar education`).toContain("NUS");
      expect(text, `${template.name} sidebar contact`).toContain("priya@example.com");
    }
  }, 60_000);
});

/** The page box in points, which is what actually differs between papers. */
async function pageSizeOf(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const page = await document.getPage(1);
  const [, , width, height] = page.view as number[];
  return `${Math.round(width)}x${Math.round(height)}`;
}

describe("page size", () => {
  /*
   * A4 was hardcoded, so a résumé for the United States could not be Letter —
   * while lib/resume/markets.ts had said `pageSize: "Letter"` for the US since
   * it was written. A4 is 595x842pt; Letter is 612x792pt.
   */
  it("takes the paper from the market, with no caller involved", async () => {
    const au = await renderPdf({ ...(await fixture("modern")), market: "au" });
    const us = await renderPdf({ ...(await fixture("modern")), market: "us" });

    expect(await pageSizeOf(au)).toBe("595x842");
    expect(await pageSizeOf(us)).toBe("612x792");
  }, 60_000);

  it("still lets a caller override the paper", async () => {
    const forced = await renderPdf({ ...(await fixture("modern")), market: "au" }, "LETTER");
    expect(await pageSizeOf(forced)).toBe("612x792");
  }, 30_000);
});
