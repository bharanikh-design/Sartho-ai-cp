import type { SearchSourcePreference } from "@/lib/data/search";

export const DEFAULT_JOB_SOURCES: SearchSourcePreference[] = [
  { id: "linkedin", name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs/", type: "Professional network", coverage: "Global", trust: "User-verified", active: true },
  { id: "indeed", name: "Indeed", url: "https://www.indeed.com/", type: "Job marketplace", coverage: "Global", trust: "Established source", active: true },
];
