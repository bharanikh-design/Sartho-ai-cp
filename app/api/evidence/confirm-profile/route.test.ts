import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const update = vi.fn();
const userEq = vi.fn();
const statusEq = vi.fn();
const select = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));

const { PUT } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  select.mockResolvedValue({ data: [{ id: "one" }, { id: "two" }], error: null });
  statusEq.mockReturnValue({ select });
  userEq.mockReturnValue({ eq: statusEq });
  update.mockReturnValue({ eq: userEq });
  getAuthenticatedUser.mockResolvedValue({
    user: { id: "user-1" },
    supabase: { from: vi.fn(() => ({ update })) },
  });
});

describe("PUT /api/evidence/confirm-profile", () => {
  it("confirms every pending profile detail in one explicit action", async () => {
    const response = await PUT();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmed: 2 });
    expect(update).toHaveBeenCalledWith({ approval_status: "approved", safe_for_resume: true });
    expect(userEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(statusEq).toHaveBeenCalledWith("approval_status", "pending");
  });

  it("rejects an unauthenticated request", async () => {
    getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });
    const response = await PUT();
    expect(response.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns a safe error when confirmation cannot be stored", async () => {
    select.mockResolvedValue({ data: null, error: new Error("private database detail") });
    const response = await PUT();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Sartho could not confirm your career profile." });
  });
});
