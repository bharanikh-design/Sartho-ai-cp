import { describe, expect, it } from "vitest";
import type { JobRecommendation, JobStatus } from "@/lib/types";
import { summarizeDashboardJobs } from "./job-metrics";

function job(status: JobStatus, recommendation: JobRecommendation | null = null) {
  return { status, recommendation };
}

describe("dashboard job metrics", () => {
  it("does not count an approved role as an application", () => {
    const metrics = summarizeDashboardJobs([
      job("approved", "apply"),
      job("applied", "apply"),
      job("interview", "review"),
    ]);

    expect(metrics.activeApplications).toBe(2);
    expect(metrics.interviewCount).toBe(1);
    expect(metrics.strongMatches).toBe(2);
  });

  it("keeps terminal outcomes separate from active applications", () => {
    const metrics = summarizeDashboardJobs([
      job("offer"),
      job("rejected"),
      job("withdrawn"),
    ]);

    expect(metrics.activeApplications).toBe(0);
    expect(metrics.outcomeCount).toBe(3);
  });
});
