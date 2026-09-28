import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The address route, with the address rules themselves replaced. What is
 * checked here is the seam: the session is required, the body is validated,
 * the service role does the writing with the account's own email as the
 * reference, and every outcome comes back with the state the page renders.
 */

const getAuthenticatedUser = vi.fn();
const setNotificationAddress = vi.fn();
const loadNotificationAddress = vi.fn();
const createAdminClient = vi.fn();

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createAdminClient() }));
vi.mock("@/lib/notifications/address", () => ({
  setNotificationAddress: (...args: unknown[]) => setNotificationAddress(...args),
  loadNotificationAddress: (...args: unknown[]) => loadNotificationAddress(...args),
}));

const { PUT } = await import("./route");

const ADMIN = { admin: true };

function put(body: unknown) {
  return PUT(new Request("http://localhost/api/notifications/address", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "user-1", email: "me@example.com" } });
  createAdminClient.mockReturnValue(ADMIN);
  loadNotificationAddress.mockResolvedValue(null);
});

describe("PUT /api/notifications/address", () => {
  it("needs a session", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: null });
    const response = await put({ email: "colleague@example.com" });
    expect(response.status).toBe(401);
    expect(setNotificationAddress).not.toHaveBeenCalled();
  });

  it("refuses anything that is not an address", async () => {
    for (const body of [{ email: "not-an-address" }, { email: "" }, {}, "x"]) {
      const response = await put(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(setNotificationAddress).not.toHaveBeenCalled();
  });

  it("hands the address to the service role with the account's own email as the reference, and nothing else from the body", async () => {
    setNotificationAddress.mockResolvedValue({ outcome: "confirmation_sent", email: "colleague@example.com" });
    loadNotificationAddress.mockResolvedValue({
      email: "colleague@example.com", verified: false, pendingEmail: null, awaitingConfirmation: "colleague@example.com",
      verificationSentAt: "2026-09-28T10:00:00.000Z", digestEnabled: false, matchAlertsEnabled: true,
      lastSentAt: null, matchAlertsLastRunAt: null, updatedAt: null, digestLastTestAt: null, matchAlertsLastTestAt: null,
    });

    const response = await put({ email: " colleague@example.com ", email_verified_at: "2020-01-01", enabled: true });
    expect(response.status).toBe(200);
    expect(setNotificationAddress).toHaveBeenCalledWith(ADMIN, { userId: "user-1", accountEmail: "me@example.com", requested: "colleague@example.com" });

    const body = await response.json();
    expect(body.outcome).toBe("confirmation_sent");
    expect(body.address).toEqual({
      confirmed: null,
      awaitingConfirmation: "colleague@example.com",
      verificationSentAt: "2026-09-28T10:00:00.000Z",
      digestEnabled: false,
      matchAlertsEnabled: true,
    });
  });

  it("says when no link can go out, and reports the address as not in force", async () => {
    setNotificationAddress.mockResolvedValue({ outcome: "delivery_unavailable" });
    const response = await put({ email: "colleague@example.com" });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("email_not_configured");
    expect(body.error).toContain("confirmation link");
    expect(body.address).toBeNull();
  });

  it("passes the cooldown through as a plain answer, not a failure", async () => {
    setNotificationAddress.mockResolvedValue({ outcome: "already_sent", email: "colleague@example.com", retryInMinutes: 3 });
    const response = await put({ email: "colleague@example.com" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "already_sent", retryInMinutes: 3 });
  });

  it("answers 503 rather than writing with the browser's own grant when the service role is missing", async () => {
    createAdminClient.mockImplementation(() => { throw new Error("Supabase administrator configuration is missing."); });
    const response = await put({ email: "colleague@example.com" });
    expect(response.status).toBe(503);
    expect(setNotificationAddress).not.toHaveBeenCalled();
  });
});
