import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/*
 * The auth guard must not stand in front of files that exist to be read
 * anonymously.
 *
 * robots.txt, sitemap.xml and the well-known paths were caught by this matcher
 * and answered with a 307 to /login. A crawler asking for robots.txt therefore
 * received an HTML sign-in page, and Google treats an unparseable robots.txt as
 * though the site published no rules at all — the opposite of what a private
 * beta wants.
 *
 * Each entry below is an exact filename or a reserved prefix, not a broad
 * pattern: a loose exclusion here silently unguards real product routes, which
 * is a worse failure than the one being fixed.
 *
 * opengraph-image earns its place the hard way. Next serves the generated image
 * at "/opengraph-image?<hash>" with no file extension, so the extension rule
 * above does not cover it and the guard answered og:image with a 307 to /login.
 * That failure is invisible from the page: the tags render perfectly and the
 * shared link stays blank, which reads as "fixed" to everyone except a scraper.
 * These are reserved App Router metadata route names, so no product page can
 * legitimately begin with one.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|opengraph-image|twitter-image|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
