import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/*
 * Operational access must be granted by a server-controlled claim or
 * deployment configuration. Supabase user_metadata is deliberately ignored:
 * users can edit their own metadata and therefore cannot authorize themselves.
 */
export function isOperationsAdmin(user: Pick<User, "id" | "app_metadata">) {
  if (user.app_metadata?.role === "admin") return true;

  const allowlist = (process.env.SARTHO_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return allowlist.includes(user.id);
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null };
  }

  return { supabase, user };
}
