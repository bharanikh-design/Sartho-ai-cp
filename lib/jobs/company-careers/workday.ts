/*
 * Direct Workday Candidate Experience Service (CXS) client.
 *
 * Major enterprise employers (PwC, Deloitte, Accenture, Macquarie, CBA) run
 * their career portals on Workday. Their frontend queries an unauthenticated
 * REST API (CXS) to search and retrieve postings with zero CAPTCHAs.
 */

import type { JobSearchResult } from "@/lib/jobs/search-provider";
import type { DirectCareerQuery, EmployerPortalConfig } from "./types";

export type WorkdayPosting = {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
};

export type WorkdaySearchResponse = {
  total?: number;
  jobPostings?: WorkdayPosting[];
};

export function buildWorkdayApiUrl(config: EmployerPortalConfig): string {
  const domain = config.domain || `${config.tenant}.myworkdayjobs.com`;
  const site = config.site || "Careers";
  return `https://${domain}/wday/cxs/${config.tenant}/${site}/jobs`;
}

export function buildWorkdayJobUrl(config: EmployerPortalConfig, externalPath: string): string {
  const domain = config.domain || `${config.tenant}.myworkdayjobs.com`;
  const site = config.site || "Careers";
  const cleanPath = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  return `https://${domain}/en-US/${site}${cleanPath}`;
}

export function mapWorkdayPosting(posting: WorkdayPosting, config: EmployerPortalConfig): JobSearchResult | null {
  const title = posting.title?.trim();
  const externalPath = posting.externalPath?.trim();
  if (!title || !externalPath) return null;

  return {
    title,
    employer: config.name,
    location: posting.locationsText?.trim() || null,
    description: `${title}. Direct opening from ${config.name} career portal.`,
    url: buildWorkdayJobUrl(config, externalPath),
    salary: null,
    postedAt: posting.postedOn?.trim() || null,
    source: "Company Careers",
    platforms: [config.name, "Direct Apply"],
    applyDirect: true,
  };
}

export async function searchWorkdayPortal(
  config: EmployerPortalConfig,
  query: DirectCareerQuery,
  timeoutMs = 8_000,
): Promise<JobSearchResult[]> {
  const endpoint = buildWorkdayApiUrl(config);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: Math.min(Math.max(query.limit ?? 20, 1), 25),
        offset: 0,
        searchText: query.searchText,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return [];

    const body = (await response.json()) as WorkdaySearchResponse;
    const postings = body.jobPostings ?? [];

    return postings
      .map((item) => mapWorkdayPosting(item, config))
      .filter((item): item is JobSearchResult => item !== null);
  } catch {
    return [];
  }
}
