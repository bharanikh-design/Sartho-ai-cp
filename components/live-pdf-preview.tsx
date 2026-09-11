"use client";

import { PDFViewer } from "@react-pdf/renderer";
import { ResumePdfRenderer } from "@/components/resume-pdf-templates";
import type { ResumeContent } from "@/lib/resume/content";

export function LivePdfPreview({ content }: { content: ResumeContent }) {
  return (
    <PDFViewer style={{ width: "100%", height: "100%", border: "none" }}>
      <ResumePdfRenderer content={content} />
    </PDFViewer>
  );
}
