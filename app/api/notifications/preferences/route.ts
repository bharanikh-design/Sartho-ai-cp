import { saveSwitch } from "@/lib/notifications/switch-route";

/* The daily summary switch. The address lives at /api/notifications/address. */

export const runtime = "nodejs";

export async function PUT(request: Request) {
  return saveSwitch(request, "daily_digest_enabled");
}
