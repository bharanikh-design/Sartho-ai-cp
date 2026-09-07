import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { searchDrive } from "@/lib/integrations/drive";
import { googleAccessToken } from "@/lib/integrations/store";

/*
 * The résumés Sartho can see in somebody's Drive.
 *
 * Runs only when asked. Nothing here is scheduled, cached across sessions or
 * done in the background: a product whose argument is that it does not act
 * behind your back cannot have a job quietly reading Drives at 3am.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const token = await googleAccessToken(user.id);
  if (!token) {
    /*
     * Named as a state rather than an error, because it usually is one:
     * never connected, or the grant was revoked from Google's own permissions
     * page, which is a normal thing for somebody to do.
     */
    return NextResponse.json(
      { error: "Google Drive isn't connected. Connect it on the Integrations page.", code: "not_connected" },
      { status: 409 },
    );
  }

  try {
    const files = await searchDrive(token);
    return NextResponse.json({ files });
  } catch (caught) {
    console.error("Drive search failed", { message: caught instanceof Error ? caught.message : "unknown" });
    return NextResponse.json({ error: "Sartho could not search your Drive." }, { status: 502 });
  }
}
