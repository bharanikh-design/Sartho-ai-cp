/*
 * Direct Greenhouse API client.
 *
 * Tech scale-ups and modern enterprise employers (Canva, Stripe, Figma) use
 * Greenhouse, which exposes a public JSON endpoint for published job openings.
 */

import type { JobSearchResult } from "@/lib/jobs/search-provider";
import type { DirectCareerQuery, EmployerPortalConfig } from "./types";

export type GreenhouseJob = {
  id?: number;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  updated_at?: string;
  content?: string;
};

export type GreenhouseResponse = {
  jobs?: GreenhouseJob[];
};

export function mapGreenhouseJob(job: GreenhouseJob, config: EmployerPortalConfig): JobSearchResult | null {
  const title = job.title?.trim();
  const url = job.absolute_url?.trim();
  if (!title || !url) return null;

  return {
    title,
    employer: config.name,
    location: job.location?.name?.trim() || null,
    description: job.content ? job.content.replace(/<[^>]+>/g, " ").slice(0, 500) : `${title} at ${config.name}`,
    url,
    salary: null,
    postedAt: job.updated_at?.trim() || null,
    source: "Company Careers",
    platforms: [config.name, "Direct Apply"],
    applyDirect: true,
  };
}

export async function searchGreenhousePortal(
  config: EmployerPortalConfig,
  query: DirectCareerQuery,
  timeoutMs = 8_000,
): Promise<JobSearchResult[]> {
  const endpoint = `https://boards-api.greenhouse.io/v1/boards/${config.tenant}/jobs?content=true`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return [];

    const body = (await response.json()) as GreenhouseResponse;
    const jobs = body.jobs ?? [];
    const searchLower = query.searchText.toLowerCase().trim();

    return jobs
      .filter((job) => {
        if (!searchLower) return true;
        const titleMatch = (job.title ?? "").toLowerCase().includes(searchLower);
        const locMatch = query.location ? (job.location?.name ?? "").toLowerCase().includes(query.location.toLowerCase()) : true;
        return titleMatch && locMatch;
      })
      .slice(0, query.limit ?? 20)
      .map((job) => mapGreenhouseJob(job, config))
      .filter((item): item is JobSearchResult => item !== null);
  } catch {
    return [];
  }
}
