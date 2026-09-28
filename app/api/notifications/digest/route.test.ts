import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The test send. It used to take an address of its own, which made it a way
 * to send a summary of somebody's pipeline to any inbox on earth. Now it goes
 * to the confirmed address and nowhere else, and refuses while there is none.
 */

const getAuthenticatedUser = vi.fn();
const ensureNotificationRow = vi.fn();
const recordTestSend = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ admin: true }) }));
vi.mock("@/lib/notifications/address", () => ({
  ensureNotificationRow: (...args: unknown[]) => ensureNotificationRow(...args),
  recordTestSend: (...args: unknown[]) => recordTestSend(...args),
  deliverableAddress: (address: { verified: boolean; email: string | null } | null) => (address?.verified && address.email ? address.email : null),
}));
vi.mock("@/lib/notifications/send-email", () => ({
  isEmailDeliveryConfigured: () => true,
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

const { POST } = await import("./route");

/* The person's own client: an empty pipeline and a name. */
const supabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => (table === "jobs"
        ? Promise.resolve({ data: [], error: null })
        : { maybeSingle: () => Promise.resolve({ data: { full_name: "Evie Example" }, error: null }) }),
    }),
  }),
};

const address = (overrides: Record<string, unknown>) => ({
  email: "me@example.com", verified: true, pendingEmail: null, awaitingConfirmation: null, verificationSentAt: null,
  digestEnabled: true, matchAlertsEnabled: false, lastSentAt: null, matchAlertsLastRunAt: null, updatedAt: null,
  digestLastTestAt: null, matchAlertsLastTestAt: null, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1", email: "me@example.com" } });
  sendEmail.mockResolvedValue(undefined);
});

describe("POST /api/notifications/digest", () => {
  it("sends to the confirmed address and records the test's own timestamp", async () => {
    ensureNotificationRow.mockResolvedValue({ ok: true, address: address({}) });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toBe("me@example.com");
    expect(String(sendEmail.mock.calls[0][1])).toContain("(test)");
    expect(recordTestSend).toHaveBeenCalledWith({ admin: true }, { userId: "user-1", column: "daily_digest_last_test_at" });
  });

  it("refuses while the address has not been confirmed", async () => {
    ensureNotificationRow.mockResolvedValue({ ok: true, address: address({ email: "colleague@example.com", verified: false, awaitingConfirmation: "colleague@example.com" }) });
    const response = await POST();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "unverified" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordTestSend).not.toHaveBeenCalled();
  });

  it("asks for an address when the account has none", async () => {
    ensureNotificationRow.mockResolvedValue({ ok: false, reason: "no_address" });
    const response = await POST();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "no_address" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("holds a second test back for a few minutes", async () => {
    ensureNotificationRow.mockResolvedValue({ ok: true, address: address({ digestLastTestAt: new Date().toISOString() }) });
    const response = await POST();
    expect(response.status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase, user: null });
    expect((await POST()).status).toBe(401);
    expect(ensureNotificationRow).not.toHaveBeenCalled();
  });
});
