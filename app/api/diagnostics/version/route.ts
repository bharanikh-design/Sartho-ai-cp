import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";

/*
 * Which commit is actually running.
 *
 * This exists because the question "is the fix deployed" has been answered by
 * guessing twice, and both times the guess was wrong in the expensive
 * direction: a fix was merged, a search was run against a build that predated
 * it, the same failure appeared, and the conclusion drawn was that the fix did
 * not work. Hours went into re-diagnosing a bug that had already been fixed.
 *
 * A commit SHA on the deployment removes the entire class of that mistake. It
 * is not a health check and deliberately touches nothing — no database, no
 * provider, no AI. It reports what this bundle was built from, which is the one
 * fact no other endpoint can give.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * When this instance first loaded. Two calls close together returning the same
 * value means one warm instance answered both, which is how a redeploy is told
 * apart from a cold start.
 */
const INSTANCE_STARTED_AT = new Date().toISOString();

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOperationsAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  /*
   * Set by Vercel at build time and absent anywhere else, so a local or
   * self-hosted run says so plainly rather than reporting an empty string as
   * though it were a commit.
   */
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;

  return NextResponse.json(
    {
      commit: sha,
      shortCommit: sha ? sha.slice(0, 7) : null,
      branch: process.env.VERCEL_GIT_COMMIT_REF?.trim() || null,
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim() || null,
      environment: process.env.VERCEL_ENV?.trim() || "local",
      instanceStartedAt: INSTANCE_STARTED_AT,
      checkedAt: new Date().toISOString(),
      note: sha
        ? "Compare this against the newest merge commit on main. If they differ, the deployment has not picked up your merge yet."
        : "No build metadata — this is not a Vercel deployment.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
