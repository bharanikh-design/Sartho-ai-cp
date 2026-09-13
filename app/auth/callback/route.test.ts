import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

import { GET } from "./route";

function callback(search: string) {
  return GET(new Request(`https://sartho.tech/auth/callback${search}`));
}

function errorFrom(response: Response) {
  const location = new URL(response.headers.get("location") ?? "");
  return {
    pathname: location.pathname,
    message: location.searchParams.get("error") ?? "",
    code: location.searchParams.get("error_code"),
  };
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("OAuth callback", () => {
  it("sends a completed exchange on to the requested page", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await callback("?code=one-time-code&next=%2Fjobs");

    expect(response.headers.get("location")).toBe("https://sartho.tech/jobs");
  });

  /*
   * Supabase's own wording for a missing verifier points at @supabase/ssr not
   * being wired up on both sides, which has never been this app's problem. The
   * real cause is always a host mismatch, and a user who is told to re-check
   * their Google credentials will go and do exactly that.
   */
  it("explains a missing code verifier as the host mismatch it is", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: {
        name: "AuthApiError",
        status: 400,
        message:
          "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device. For SSR frameworks use @supabase/ssr on both the server and client.",
      },
    });

    const { pathname, message, code } = errorFrom(await callback("?code=one-time-code"));

    expect(pathname).toBe("/login");
    expect(code).toBe("auth_origin_mismatch");
    expect(message).toContain("sartho.tech");
    expect(message).not.toContain("@supabase/ssr");
  });

  it("passes an unrelated exchange failure through unchanged", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { name: "AuthApiError", status: 401, message: "Invalid API key" },
    });

    const { message, code } = errorFrom(await callback("?code=one-time-code"));

    expect(message).toBe("Invalid API key");
    expect(code).toBe("AuthApiError");
  });

  it("refuses to bounce a sign-in off this host to somewhere else", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await callback("?code=one-time-code&next=%2F%2Fevil.example");

    /*
     * Asserted on the parts rather than the whole string. The destination now
     * carries a welcome marker, and a test pinned to an exact URL would fail
     * for that and read as though the open-redirect guard had broken — which
     * is the one thing here that must never be mistaken for cosmetic.
     */
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://sartho.tech");
    expect(location.pathname).toBe("/");
  });

  /*
   * The welcome plays once, on the way in from a real sign-in. It is carried
   * in the address because it has to be true exactly once, and the cinematic
   * strips it as it starts so a reload lands on the product instead.
   */
  it("marks a successful sign-in so the destination can welcome somebody", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await callback("?code=one-time-code");
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("welcome")).toBe("1");
  });

  it("does not welcome somebody into a page that is not the home page", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await callback("?code=one-time-code&next=%2Fresume-studio");
    const location = new URL(response.headers.get("location") ?? "");

    /* Somebody returning to a deep link asked for that page, not an introduction. */
    expect(location.pathname).toBe("/resume-studio");
    expect(location.searchParams.get("welcome")).toBeNull();
  });
});
