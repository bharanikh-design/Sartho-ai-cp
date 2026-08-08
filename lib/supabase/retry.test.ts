import { describe, expect, it, vi } from "vitest";
import { isJwtIssuedAtFutureError, withJwtClockSkewRetry } from "./retry";

type TestResult = {
  data: string[] | null;
  error: { code: string; message: string } | null;
};

describe("Supabase JWT clock-skew recovery", () => {
  it("recognises only the specific PostgREST future-token error", () => {
    expect(isJwtIssuedAtFutureError({ code: "PGRST303", message: "JWT issued at future" })).toBe(true);
    expect(isJwtIssuedAtFutureError({ code: "PGRST303", message: "JWT expired" })).toBe(false);
    expect(isJwtIssuedAtFutureError({ code: "42P01", message: "relation missing" })).toBe(false);
  });

  it("waits and retries the future-token error once", async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST303", message: "JWT issued at future" } })
      .mockResolvedValueOnce({ data: ["ready"], error: null });

    const resultPromise = withJwtClockSkewRetry<TestResult>(operation, (result) => result.error, 2_000);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(resultPromise).resolves.toEqual({ data: ["ready"], error: null });
    expect(operation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry unrelated failures", async () => {
    const failure = { data: null, error: { code: "42P01", message: "relation missing" } };
    const operation = vi.fn().mockResolvedValue(failure);

    await expect(
      withJwtClockSkewRetry<TestResult>(operation, (result) => result.error, 0),
    ).resolves.toBe(failure);
    expect(operation).toHaveBeenCalledOnce();
  });
});
