import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashVerificationToken } from "./verification-token";

/*
 * The address rules, against a recording stand-in for the table.
 *
 * What matters: the account's own address is accepted at once, any other
 * address is written as waiting and sent a link, nothing is deliverable until
 * the link is clicked, the link works once, and a confirmed address stays in
 * force while a replacement waits.
 */

type Row = Record<string, unknown>;
const table: { rows: Row[]; sent: Array<{ to: string; subject: string; html: string }> } = { rows: [], sent: [] };

const sendEmail = vi.fn(async (to: string, subject: string, html: string) => { table.sent.push({ to, subject, html }); });
vi.mock("@/lib/notifications/send-email", () => ({
  isEmailDeliveryConfigured: () => process.env.TEST_EMAIL_CONFIGURED !== "no",
  sendEmail: (...args: [string, string, string]) => sendEmail(...args),
}));

/* Enough of PostgREST's builder to run the module: from/select/eq/maybeSingle/single/insert/update/upsert. */
function fakeAdmin() {
  const find = (filters: Array<[string, unknown]>) => table.rows.find((row) => filters.every(([key, value]) => row[key] === value)) ?? null;
  const chain = (state: { op: "select" | "insert" | "update" | "upsert"; values?: Row; filters: Array<[string, unknown]>; select?: boolean }) => {
    const api = {
      select: () => { state.select = true; return api; },
      eq: (key: string, value: unknown) => { state.filters.push([key, value]); return api; },
      maybeSingle: async () => ({ data: find(state.filters), error: null }),
      single: async () => ({ data: run(), error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => void) => resolve({ data: run(), error: null }),
    };
    const run = () => {
      if (state.op === "select") return find(state.filters);
      if (state.op === "insert") { const row = { ...state.values }; table.rows.push(row); return row; }
      if (state.op === "upsert") {
        const existing = find([["user_id", state.values!.user_id]]);
        if (existing) { Object.assign(existing, state.values); return existing; }
        const row = { ...state.values }; table.rows.push(row); return row;
      }
      const existing = find(state.filters);
      if (existing) Object.assign(existing, state.values);
      return existing;
    };
    return api;
  };
  return {
    from: () => ({
      select: () => chain({ op: "select", filters: [] }),
      insert: (values: Row) => chain({ op: "insert", values, filters: [] }),
      upsert: (values: Row) => chain({ op: "upsert", values, filters: [] }),
      update: (values: Row) => chain({ op: "update", values, filters: [] }),
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const {
  confirmNotificationAddress,
  deliverableAddress,
  ensureNotificationRow,
  loadNotificationAddress,
  resendConfirmation,
  setNotificationAddress,
  setNotificationSwitch,
} = await import("./address");

const USER = "0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";
const ACCOUNT = "Evie@Example.com";

function sentToken(): string {
  const last = table.sent[table.sent.length - 1];
  const match = /token=([A-Za-z0-9_-]{43})/.exec(last?.html ?? "");
  if (!match) throw new Error("no confirmation link was sent");
  return match[1];
}

beforeEach(() => {
  table.rows = [];
  table.sent = [];
  sendEmail.mockClear();
  delete process.env.TEST_EMAIL_CONFIGURED;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setNotificationAddress", () => {
  it("accepts the account's own sign-in address at once, whatever its case", async () => {
    const admin = fakeAdmin();
    const outcome = await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "evie@example.com" });
    expect(outcome).toEqual({ outcome: "verified", email: "evie@example.com" });
    expect(table.sent).toHaveLength(0);
    const address = await loadNotificationAddress(admin, USER);
    expect(address?.verified).toBe(true);
    expect(deliverableAddress(address)).toBe("evie@example.com");
  });

  it("writes any other address as waiting and sends it a link, with nothing deliverable yet", async () => {
    const admin = fakeAdmin();
    const outcome = await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "colleague@example.com", appUrl: "https://sartho.tech" });
    expect(outcome).toEqual({ outcome: "confirmation_sent", email: "colleague@example.com" });

    expect(table.sent).toHaveLength(1);
    expect(table.sent[0].to).toBe("colleague@example.com");
    expect(table.sent[0].html).toContain("https://sartho.tech/api/notifications/verify?token=");
    /* Nothing about the account that asked, and no token in the clear on the row. */
    expect(table.sent[0].html).not.toContain(USER);
    expect(JSON.stringify(table.rows[0])).not.toContain(sentToken());
    expect(table.rows[0].verification_token_hash).toBe(hashVerificationToken(sentToken()));

    const address = await loadNotificationAddress(admin, USER);
    expect(address?.verified).toBe(false);
    expect(address?.awaitingConfirmation).toBe("colleague@example.com");
    expect(deliverableAddress(address)).toBeNull();
  });

  it("keeps a confirmed address in force while a replacement waits", async () => {
    const admin = fakeAdmin();
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: ACCOUNT });
    const outcome = await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "new@example.com" });
    expect(outcome.outcome).toBe("confirmation_sent");

    const address = await loadNotificationAddress(admin, USER);
    expect(deliverableAddress(address)).toBe(ACCOUNT);
    expect(address?.pendingEmail).toBe("new@example.com");
    expect(address?.awaitingConfirmation).toBe("new@example.com");
  });

  it("does not send a second link within the cooldown, and says when it can", async () => {
    const admin = fakeAdmin();
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "colleague@example.com" });
    const again = await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "colleague@example.com" });
    expect(again.outcome).toBe("already_sent");
    expect(table.sent).toHaveLength(1);
    const resend = await resendConfirmation(admin, { userId: USER });
    expect(resend.outcome).toBe("already_sent");
    expect(table.sent).toHaveLength(1);
  });

  it("holds a different address back inside the cooldown too: the cooldown is per account", async () => {
    const admin = fakeAdmin();
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "first@example.com" });
    const again = await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "second@example.com" });
    expect(again).toEqual({ outcome: "already_sent", email: "first@example.com", retryInMinutes: 5 });
    expect(table.sent).toHaveLength(1);
    expect(table.rows[0].email).toBe("first@example.com");
    /* The account's own address is never held back: nothing is sent for it. */
    const own = await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: ACCOUNT });
    expect(own.outcome).toBe("verified");
    expect(table.sent).toHaveLength(1);
  });

  it("has nothing to resend once the address is confirmed, or before there is one", async () => {
    const admin = fakeAdmin();
    expect(await resendConfirmation(admin, { userId: USER })).toEqual({ outcome: "nothing_pending" });
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: ACCOUNT });
    expect(await resendConfirmation(admin, { userId: USER })).toEqual({ outcome: "nothing_pending" });
    expect(table.sent).toHaveLength(0);
  });

  it("cannot put a stranger's address in force when no email can be sent to it", async () => {
    process.env.TEST_EMAIL_CONFIGURED = "no";
    const admin = fakeAdmin();
    const outcome = await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "colleague@example.com" });
    expect(outcome).toEqual({ outcome: "delivery_unavailable" });
    expect(deliverableAddress(await loadNotificationAddress(admin, USER))).toBeNull();
  });
});

describe("confirmNotificationAddress", () => {
  it("promotes the waiting address on a valid link, exactly once", async () => {
    const admin = fakeAdmin();
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "colleague@example.com" });
    const token = sentToken();

    expect(await confirmNotificationAddress(admin, token)).toBe("confirmed");
    const address = await loadNotificationAddress(admin, USER);
    expect(deliverableAddress(address)).toBe("colleague@example.com");
    expect(address?.awaitingConfirmation).toBeNull();

    expect(await confirmNotificationAddress(admin, token)).toBe("invalid");
  });

  it("replaces a confirmed address only when its replacement's link is clicked", async () => {
    const admin = fakeAdmin();
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: ACCOUNT });
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "new@example.com" });
    expect(await confirmNotificationAddress(admin, sentToken())).toBe("confirmed");
    expect(deliverableAddress(await loadNotificationAddress(admin, USER))).toBe("new@example.com");
  });

  it("refuses a forged, malformed or expired link", async () => {
    const admin = fakeAdmin();
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "colleague@example.com" });
    expect(await confirmNotificationAddress(admin, "not-a-token")).toBe("invalid");
    expect(await confirmNotificationAddress(admin, "A".repeat(43))).toBe("invalid");
    expect(await confirmNotificationAddress(admin, null)).toBe("invalid");

    table.rows[0].verification_expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await confirmNotificationAddress(admin, sentToken())).toBe("expired");
    expect(deliverableAddress(await loadNotificationAddress(admin, USER))).toBeNull();
  });
});

describe("ensureNotificationRow", () => {
  it("creates the row with the sign-in address confirmed, and returns the existing one after that", async () => {
    const admin = fakeAdmin();
    const first = await ensureNotificationRow(admin, { userId: USER, accountEmail: ACCOUNT });
    expect(first.ok && deliverableAddress(first.address)).toBe(ACCOUNT);
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "new@example.com" });
    const again = await ensureNotificationRow(admin, { userId: USER, accountEmail: ACCOUNT });
    expect(again.ok && again.address.awaitingConfirmation).toBe("new@example.com");
    expect(table.rows).toHaveLength(1);
  });

  it("has nothing to start from without a sign-in address", async () => {
    expect(await ensureNotificationRow(fakeAdmin(), { userId: USER, accountEmail: "  " })).toEqual({ ok: false, reason: "no_address" });
    expect(table.rows).toHaveLength(0);
  });
});

describe("setNotificationSwitch", () => {
  it("creates the row with the account's own address, already confirmed", async () => {
    const admin = fakeAdmin();
    const result = await setNotificationSwitch(admin, { userId: USER, accountEmail: ACCOUNT, column: "daily_digest_enabled", enabled: true });
    expect(result.ok).toBe(true);
    const address = await loadNotificationAddress(admin, USER);
    expect(address?.digestEnabled).toBe(true);
    expect(deliverableAddress(address)).toBe(ACCOUNT);
  });

  it("asks for an address when the account has none to start from", async () => {
    const admin = fakeAdmin();
    const result = await setNotificationSwitch(admin, { userId: USER, accountEmail: null, column: "match_alerts_enabled", enabled: true });
    expect(result).toEqual({ ok: false, reason: "no_address" });
  });

  it("flips a switch without touching the address", async () => {
    const admin = fakeAdmin();
    await setNotificationAddress(admin, { userId: USER, accountEmail: ACCOUNT, requested: "colleague@example.com" });
    const result = await setNotificationSwitch(admin, { userId: USER, accountEmail: ACCOUNT, column: "match_alerts_enabled", enabled: true });
    expect(result.ok && result.address.matchAlertsEnabled).toBe(true);
    expect(deliverableAddress(await loadNotificationAddress(admin, USER))).toBeNull();
  });
});
