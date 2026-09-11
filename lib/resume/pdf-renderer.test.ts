import { describe, expect, it } from "vitest";
import { ResumePdfRenderer } from "@/components/resume-pdf-templates";
import { emptyContent } from "@/lib/resume/content";

describe("ResumePdfRenderer", () => {
  it("creates an A4 document from an empty draft", () => {
    const document = ResumePdfRenderer({ content: emptyContent() });
    const page = document.props.children as { props: { size: string } };

    expect(document.props.title).toBe("Résumé");
    expect(page.props.size).toBe("A4");
  });
});
