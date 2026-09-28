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

/*
 * Only ever a Workday host. The tenant and site are path segments typed or
 * scraped from a URL, so they are encoded; the host is checked against the
 * one domain this client exists to talk to, whatever a saved row says.
 */
function workdayDomain(config: EmployerPortalConfig): string {
  const tenant = encodeURIComponent(config.tenant).toLowerCase();
  const stored = config.domain?.trim().toLowerCase();
  if (stored && /^[a-z0-9][a-z0-9.-]*\.myworkdayjobs\.com$/.test(stored)) return stored;
  return `${tenant}.myworkdayjobs.com`;
}

export function buildWorkdayApiUrl(config: EmployerPortalConfig): string {
  const domain = workdayDomain(config);
  const site = encodeURIComponent(config.site || "Careers");
  return `https://${domain}/wday/cxs/${encodeURIComponent(config.tenant)}/${site}/jobs`;
}

export function buildWorkdayJobUrl(config: EmployerPortalConfig, externalPath: string): string {
  const domain = workdayDomain(config);
  const site = encodeURIComponent(config.site || "Careers");
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

    if (!response.ok) throw new Error(`Workday request failed with status ${response.status}`);

    const body = (await response.json()) as WorkdaySearchResponse;
    const postings = body.jobPostings ?? [];

    return postings
      .map((item) => mapWorkdayPosting(item, config))
      .filter((item): item is JobSearchResult => item !== null);
  } catch (caught) {
    throw caught instanceof Error ? caught : new Error("Workday request failed");
  }
}
