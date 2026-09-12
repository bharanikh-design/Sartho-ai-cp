import { NextResponse } from "next/server";
import { getAuthenticatedUser, isOperationsAdmin } from "@/lib/auth";
import { loadProductJourneyStatus } from "@/lib/journey/load-product-journey";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });

  try {
    const journey = await loadProductJourneyStatus(supabase, user.id);
    return NextResponse.json(
      {
        activated: journey.activated,
        progress: journey.progress,
        currentHref: journey.current.href,
        currentLabel: journey.current.label,
        // Uploading is the prerequisite for everything else, so the shell needs
        // to know whether it has happened before it renders the menu.
        hasResume: journey.steps.find((step) => step.id === "resume")?.complete ?? false,
        /*
         * Per-step completion, so the shell can congratulate somebody the
         * moment a step is finished. The aggregate progress percentage cannot
         * do that — it says how far along you are, never which thing you just
         * finished, and "which thing" is the whole content of the message.
         */
        steps: journey.steps.map((step) => ({ id: step.id, label: step.label, complete: step.complete })),
        /*
         * Whether this person is an operations administrator.
         *
         * Answered here because the shell is a client component and the
         * allowlist behind isOperationsAdmin is a server environment variable.
         * The rail used to decide it with a hardcoded email address compiled
         * into the browser bundle, which was wrong three ways: it shipped a
         * personal address to every visitor, it disagreed with the check the
         * /admin page itself performs, and a second administrator added to the
         * allowlist could reach the page but never see a link to it.
         *
         * It is not a permission — every admin route checks for itself. It
         * only decides whether a link is worth drawing.
         */
        isAdmin: isOperationsAdmin(user),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Unable to load journey status", error);
    return NextResponse.json({ error: "Sartho could not refresh your journey status." }, { status: 500 });
  }
}
