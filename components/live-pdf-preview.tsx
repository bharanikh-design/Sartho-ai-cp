"use client";

import { PDFViewer } from "@react-pdf/renderer";
import { ResumePdfRenderer } from "@/components/resume-pdf-templates";
import type { ResumeContent } from "@/lib/resume/content";

/*
 * This module is imported through a client-only dynamic boundary in
 * resume-studio. @react-pdf/renderer is ESM-only; keeping the boundary outside
 * this module prevents Next/Webpack from trying to resolve it through a
 * CommonJS server path during production compilation.
 */
export function LivePdfPreview({ content }: { content: ResumeContent }) {
  return (
    <PDFViewer style={{ width: "100%", height: "100%", border: "none" }}>
      <ResumePdfRenderer content={content} />
    </PDFViewer>
  );
}
