import type { JobRecommendation, JobStatus } from "@/lib/types";

type DashboardJob = {
  status: JobStatus;
  recommendation: JobRecommendation | null;
};

const activeApplicationStatuses = new Set<JobStatus>([
  "applied",
  "acknowledged",
  "assessment",
  "interview",
]);

const interviewStatuses = new Set<JobStatus>(["assessment", "interview"]);
const outcomeStatuses = new Set<JobStatus>(["offer", "rejected", "withdrawn"]);

export function summarizeDashboardJobs(jobs: DashboardJob[]) {
  return {
    activeApplications: jobs.filter((job) => activeApplicationStatuses.has(job.status)).length,
    interviewCount: jobs.filter((job) => interviewStatuses.has(job.status)).length,
    outcomeCount: jobs.filter((job) => outcomeStatuses.has(job.status)).length,
    strongMatches: jobs.filter((job) => job.recommendation === "apply").length,
  };
}
