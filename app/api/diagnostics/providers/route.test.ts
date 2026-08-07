import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const isOperationsAdmin = vi.fn();
const getCachedProviderHealth = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
  isOperationsAdmin: (...args: unknown[]) => isOperationsAdmin(...args),
}));
vi.mock("@/lib/ai/diagnostics", () => ({
  getCachedProviderHealth: () => getCachedProviderHealth(),
}));

const { GET } = await import("./route");

const snapshot = {
  checkedAt: "2026-08-06T10:00:00.000Z",
  providers: [
    {
      name: "OpenAI",
      envVar: "OPENAI_API_KEY",
      selected: true,
      configured: true,
      reachable: true,
      model: "gpt-5.6-luna",
      detail: "answered",
      raw: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({ user: { id: "user-1", app_metadata: {} } });
  isOperationsAdmin.mockReturnValue(true);
  getCachedProviderHealth.mockResolvedValue(snapshot);
});

describe("GET /api/diagnostics/providers", () => {
  it("rejects an unauthenticated request without probing", async () => {
    getAuthenticatedUser.mockResolvedValue({ user: null });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getCachedProviderHealth).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-admin without probing", async () => {
    isOperationsAdmin.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(getCachedProviderHealth).not.toHaveBeenCalled();
  });

  it("returns the shared active-provider snapshot to an admin", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      checkedAt: snapshot.checkedAt,
      willUse: "OpenAI",
      summary: "OpenAI is selected and working.",
    });
    expect(getCachedProviderHealth).toHaveBeenCalledTimes(1);
  });

  it("keeps the live provider check in a five-minute server cache", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("lib/ai/diagnostics.ts", "utf8");

    expect(source).toContain("unstable_cache");
    expect(source).toMatch(/revalidate:\s*300/);
  });
});
