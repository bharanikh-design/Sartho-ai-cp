import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { resumeContentSchema } from "@/lib/resume/content-schema";
import { resumeDocxBuffer, resumeFileName } from "@/lib/resume/docx";

/*
 * The résumé as a Word file.
 *
 * The document is posted rather than read from the row, because what somebody
 * wants to download is what is on their screen — including the edits they have
 * not saved yet. Downloading the saved version while the editor shows something
 * else is the kind of quiet mismatch that is only discovered after the file has
 * been sent to an employer.
 *
 * No AI and no quota: this is a format conversion of text the person already
 * has. It still requires a session, because the body is somebody's career.
 *
 * PDF is deliberately not here. It is produced by the browser's own print
 * pipeline, which keeps the text as text — a server-rendered PDF would need a
 * headless browser, and the naive alternatives rasterise the page into an image
 * that scores zero with every applicant tracking system that opens it.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const inputSchema = z.object({
  content: resumeContentSchema,
  versionName: z.string().trim().max(180).default(""),
  employer: z.string().trim().max(180).nullable().default(null),
});

export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "There is nothing to download." }, { status: 400 });
  }

  const { content, versionName, employer } = input.data;
  const hasBody = content.name
    || content.targetRole
    || content.summary
    || content.roles.some((role) => role.title || role.employer || role.bullets.length)
    || content.sections.some((section) => section.bullets.length)
    || content.skills.length
    || content.education.length;
  if (!hasBody) {
    return NextResponse.json({ error: "This draft is empty, so there is nothing to download." }, { status: 400 });
  }

  try {
    const buffer = await resumeDocxBuffer(content);
    const fileName = resumeFileName(versionName, employer, "docx");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        /*
         * Both forms of the filename: the plain one for older clients, and the
         * UTF-8 form so an accented name survives instead of arriving mangled.
         */
        "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (caught) {
    console.error("Unable to build the résumé DOCX", caught);
    return NextResponse.json({ error: "Sartho could not build the Word file. Your draft is unchanged." }, { status: 500 });
  }
}
