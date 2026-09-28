import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The confirmation link. Opening it must confirm nothing — mail scanners open
 * every link — and pressing the button on the page is what says yes.
 */

const confirmNotificationAddress = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ admin: true }) }));
vi.mock("@/lib/notifications/address", () => ({
  confirmNotificationAddress: (...args: unknown[]) => confirmNotificationAddress(...args),
}));

const { GET, POST } = await import("./route");

/* The shape of a real token: base64url of 32 bytes. */
const TOKEN = "Zm9v".repeat(10) + "Zm8";

function press(token: string) {
  return POST(new Request("http://localhost/api/notifications/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/notifications/verify", () => {
  it("opening the link confirms nothing: it shows one button", async () => {
    const response = await GET(new Request(`http://localhost/api/notifications/verify?token=${TOKEN}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain('<form method="post" action="/api/notifications/verify">');
    expect(html).toContain(`name="token" value="${TOKEN}"`);
    expect(confirmNotificationAddress).not.toHaveBeenCalled();
  });

  it("shows no button for a link that cannot be one of ours", async () => {
    for (const query of ["", "?token=", "?token=short", `?token=${TOKEN}<script>`]) {
      const response = await GET(new Request(`http://localhost/api/notifications/verify${query}`));
      expect(response.status, query).toBe(400);
      expect(await response.text()).not.toContain("<form");
    }
    expect(confirmNotificationAddress).not.toHaveBeenCalled();
  });
});

describe("POST /api/notifications/verify", () => {
  it("pressing the button is what confirms", async () => {
    confirmNotificationAddress.mockResolvedValue("confirmed");
    const response = await press(TOKEN);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Address confirmed");
    expect(confirmNotificationAddress).toHaveBeenCalledWith({ admin: true }, TOKEN);
  });

  it("says when the link has expired, and when it is not one of ours", async () => {
    confirmNotificationAddress.mockResolvedValueOnce("expired");
    const expired = await press(TOKEN);
    expect(expired.status).toBe(410);
    expect(await expired.text()).toContain("expired");

    confirmNotificationAddress.mockResolvedValueOnce("invalid");
    const invalid = await press(TOKEN);
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain("not valid");
  });

  it("copes with a body that is not a form", async () => {
    confirmNotificationAddress.mockResolvedValue("invalid");
    const response = await POST(new Request("http://localhost/api/notifications/verify", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
    expect(response.status).toBe(400);
    expect(confirmNotificationAddress).toHaveBeenCalledWith({ admin: true }, null);
  });
});
