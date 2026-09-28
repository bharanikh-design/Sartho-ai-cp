import { describe, expect, it } from "vitest";
import { scheduledJobHealth, scheduledJobsHealth, type ScheduledRunRecord } from "./scheduled-runs";

const NOW = new Date("2026-09-28T12:00:00Z");

function run(partial: Partial<ScheduledRunRecord> & { job: ScheduledRunRecord["job"]; hoursAgo: number }): ScheduledRunRecord {
  const startedAt = new Date(NOW.getTime() - partial.hoursAgo * 60 * 60 * 1000).toISOString();
  return {
    id: partial.id ?? `${partial.job}-${partial.hoursAgo}`,
    job: partial.job,
    startedAt,
    finishedAt: partial.status === "running" ? null : startedAt,
    status: partial.status ?? "succeeded",
    error: partial.error ?? null,
  };
}

describe("scheduledJobHealth", () => {
  it("calls a job that has no rows at all one that never ran, and says where to look", () => {
    const health = scheduledJobHealth("daily-digest", [], NOW);
    expect(health.state).toBe("never");
    expect(health.message).toMatch(/never run/);
    expect(health.lastRunAt).toBeNull();
  });

  it("is healthy after a success within the last day and a bit", () => {
    const health = scheduledJobHealth("daily-digest", [run({ job: "daily-digest", hoursAgo: 12 })], NOW);
    expect(health.state).toBe("healthy");
    expect(health.message).toMatch(/12 hours ago/);
  });

  it("tolerates a schedule that drifted, but not a day and a half of silence", () => {
    expect(scheduledJobHealth("daily-digest", [run({ job: "daily-digest", hoursAgo: 29 })], NOW).state).toBe("healthy");
    const stale = scheduledJobHealth("daily-digest", [run({ job: "daily-digest", hoursAgo: 31 })], NOW);
    expect(stale.state).toBe("stale");
    expect(stale.message).toMatch(/stopped reaching/);
  });

  it("reports the last failure in its own words, with the last success beside it", () => {
    const health = scheduledJobHealth("match-alerts", [
      run({ job: "match-alerts", hoursAgo: 1, status: "failed", error: "Email delivery is not configured." }),
      run({ job: "match-alerts", hoursAgo: 25 }),
    ], NOW);
    expect(health.state).toBe("failing");
    expect(health.message).toContain("Email delivery is not configured.");
    expect(health.message).toMatch(/last succeeded 25 hours ago/);
    expect(health.lastSuccessAt).not.toBeNull();
  });

  it("treats a run still marked running after twenty minutes as cut off", () => {
    const fresh = scheduledJobHealth("match-alerts", [
      run({ job: "match-alerts", hoursAgo: 0.1, status: "running" }),
      run({ job: "match-alerts", hoursAgo: 24 }),
    ], NOW);
    expect(fresh.state).toBe("healthy");

    const abandoned = scheduledJobHealth("match-alerts", [
      run({ job: "match-alerts", hoursAgo: 2, status: "running" }),
      run({ job: "match-alerts", hoursAgo: 24 }),
    ], NOW);
    expect(abandoned.state).toBe("failing");
    expect(abandoned.message).toMatch(/cut off/);
  });

  it("does not let one job's rows speak for the other", () => {
    const rows = [run({ job: "daily-digest", hoursAgo: 2 })];
    expect(scheduledJobHealth("daily-digest", rows, NOW).state).toBe("healthy");
    expect(scheduledJobHealth("match-alerts", rows, NOW).state).toBe("never");
    expect(scheduledJobsHealth(rows, NOW).map((health) => health.state)).toEqual(["healthy", "never"]);
  });
});
