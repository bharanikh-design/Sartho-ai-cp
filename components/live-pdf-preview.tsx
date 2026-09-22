"use client";

import dynamic from "next/dynamic";
import { ResumePdfRenderer } from "@/components/resume-pdf-templates";
import type { ResumeContent } from "@/lib/resume/content";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  { ssr: false }
);

export function LivePdfPreview({ content }: { content: ResumeContent }) {
  return (
    <PDFViewer style={{ width: "100%", height: "100%", border: "none" }}>
      <ResumePdfRenderer content={content} />
    </PDFViewer>
  );
}
