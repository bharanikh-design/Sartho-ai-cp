import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
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
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Unable to load journey status", error);
    return NextResponse.json({ error: "Sartho could not refresh your journey status." }, { status: 500 });
  }
}
