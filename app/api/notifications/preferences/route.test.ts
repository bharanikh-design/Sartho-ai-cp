import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A switch route. The body used to carry an address and the route used to
 * write it as typed; it now carries a switch and nothing else reaches the
 * table. The match-alerts PUT is the same handler with the other column.
 */

const getAuthenticatedUser = vi.fn();
const setNotificationSwitch = vi.fn();

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ admin: true }) }));
vi.mock("@/lib/notifications/address", () => ({
  setNotificationSwitch: (...args: unknown[]) => setNotificationSwitch(...args),
}));

const { PUT } = await import("./route");

function put(body: unknown) {
  return PUT(new Request("http://localhost/api/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

const ADDRESS = {
  email: "me@example.com", verified: true, pendingEmail: null, awaitingConfirmation: null, verificationSentAt: null,
  digestEnabled: true, matchAlertsEnabled: false, lastSentAt: null, matchAlertsLastRunAt: null, updatedAt: null,
  digestLastTestAt: null, matchAlertsLastTestAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "user-1", email: "me@example.com" } });
});

describe("PUT /api/notifications/preferences", () => {
  it("saves the switch and lets an address in the body go nowhere", async () => {
    setNotificationSwitch.mockResolvedValue({ ok: true, address: ADDRESS });
    const response = await put({ email: "stranger@example.com", enabled: true });
    expect(response.status).toBe(200);
    expect(setNotificationSwitch).toHaveBeenCalledWith({ admin: true }, {
      userId: "user-1", accountEmail: "me@example.com", column: "daily_digest_enabled", enabled: true,
    });
    expect(JSON.stringify(setNotificationSwitch.mock.calls[0])).not.toContain("stranger");
    expect(await response.json()).toEqual({
      ok: true,
      address: { confirmed: "me@example.com", awaitingConfirmation: null, verificationSentAt: null, digestEnabled: true, matchAlertsEnabled: false },
    });
  });

  it("refuses a body with no switch in it", async () => {
    for (const body of [{ email: "me@example.com" }, { enabled: "yes" }, {}]) {
      expect((await put(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(setNotificationSwitch).not.toHaveBeenCalled();
  });

  it("asks for an address when the account has none to start from", async () => {
    setNotificationSwitch.mockResolvedValue({ ok: false, reason: "no_address" });
    const response = await put({ enabled: true });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "no_address" });
  });

  it("needs a session", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: null });
    expect((await put({ enabled: true })).status).toBe(401);
    expect(setNotificationSwitch).not.toHaveBeenCalled();
  });
});
