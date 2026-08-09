import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export async function PUT() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("evidence_items")
    .update({ approval_status: "approved", safe_for_resume: true })
    .eq("user_id", user.id)
    .eq("approval_status", "pending")
    .select("id");

  if (error) {
    console.error("Unable to confirm career profile", error);
    return NextResponse.json({ error: "Sartho could not confirm your career profile." }, { status: 500 });
  }

  return NextResponse.json({ confirmed: data?.length ?? 0 });
}
