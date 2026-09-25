import { describe, expect, it } from "vitest";
import {
  classifyExistingOperation,
  DURABLE_OPERATION_STALE_MS,
} from "@/lib/operations/durable-ai";

const now = new Date("2026-09-25T12:00:00.000Z").getTime();

describe("durable AI operation classification", () => {
  it("reuses a completed request instead of spending AI twice", () => {
    expect(classifyExistingOperation({
      status: "succeeded",
      started_at: "2026-09-25T11:55:00.000Z",
    }, now)).toBe("already_succeeded");
  });

  it("blocks a duplicate while the same operation is still fresh", () => {
    expect(classifyExistingOperation({
      status: "running",
      started_at: new Date(now - DURABLE_OPERATION_STALE_MS + 1_000).toISOString(),
    }, now)).toBe("already_running");
  });

  it("allows a running operation to be reclaimed after its lease expires", () => {
    expect(classifyExistingOperation({
      status: "running",
      started_at: new Date(now - DURABLE_OPERATION_STALE_MS - 1_000).toISOString(),
    }, now)).toBe("reclaim");
  });

  it("allows an explicitly failed operation to be retried", () => {
    expect(classifyExistingOperation({
      status: "failed",
      started_at: "2026-09-25T11:59:00.000Z",
    }, now)).toBe("reclaim");
  });

  it("treats an unreadable running timestamp as reclaimable instead of permanently stuck", () => {
    expect(classifyExistingOperation({
      status: "running",
      started_at: "not-a-date",
    }, now)).toBe("reclaim");
  });
});
