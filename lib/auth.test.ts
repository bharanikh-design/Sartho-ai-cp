import { afterEach, describe, expect, it, vi } from "vitest";
import { isOperationsAdmin } from "./auth";

function user(
  id: string,
  appMetadata: Record<string, unknown> = {},
  userMetadata: Record<string, unknown> = {},
) {
  return { id, app_metadata: appMetadata, user_metadata: userMetadata };
}

afterEach(() => vi.unstubAllEnvs());

describe("operations access", () => {
  it("fails closed when no admin grant exists", () => {
    expect(isOperationsAdmin(user("user-1"))).toBe(false);
  });

  it("accepts the server-controlled Supabase admin claim", () => {
    expect(isOperationsAdmin(user("user-1", { role: "admin" }))).toBe(true);
  });

  it("never trusts editable user metadata", () => {
    expect(isOperationsAdmin(user("user-1", {}, { role: "admin" }))).toBe(false);
  });

  it("accepts an exact user ID from the deployment allowlist", () => {
    vi.stubEnv("SARTHO_ADMIN_USER_IDS", " user-2, user-1 ");

    expect(isOperationsAdmin(user("user-1"))).toBe(true);
    expect(isOperationsAdmin(user("user-10"))).toBe(false);
  });
});
