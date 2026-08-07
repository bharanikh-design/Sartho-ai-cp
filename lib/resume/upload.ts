/*
 * Shared résumé-upload rules.
 *
 * The browser sends the bytes directly to private object storage so the
 * processing request never crosses Vercel's request-body limit. The API then
 * accepts only an object reference owned by the signed-in user.
 */

export const RESUME_UPLOAD_BUCKET = "resume-uploads";
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const RESUME_ACCEPT =
  ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export type SupportedKind = "pdf" | "docx" | "text";

export function detectKind(fileName: string, mimeType: string | null): SupportedKind | null {
  const name = fileName.toLowerCase();
  const type = (mimeType ?? "").toLowerCase();

  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) return "text";

  return null;
}

export function makeResumeObjectPath(userId: string, fileName: string, uploadId = crypto.randomUUID()) {
  const extension = fileName.toLowerCase().match(/\.(pdf|docx|txt|md)$/)?.[0] ?? "";
  return `${userId}/${uploadId}${extension}`;
}

export function isOwnedResumeObjectPath(path: string, userId: string) {
  const parts = path.split("/");
  return parts.length === 2
    && parts[0] === userId
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\.(pdf|docx|txt|md))?$/i.test(parts[1]);
}

export function normaliseResumeMimeType(kind: SupportedKind, provided: string | null) {
  const supported = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ]);
  if (provided && supported.has(provided.toLowerCase())) return provided.toLowerCase();

  if (kind === "pdf") return "application/pdf";
  if (kind === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/plain";
}
