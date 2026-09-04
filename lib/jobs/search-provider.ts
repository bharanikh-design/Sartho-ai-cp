/*
 * Real opportunity inflow — querying a jobs aggregator by the search brief.
 *
 * This is the one place Sartho reaches out to a third-party jobs source. It is
 * deliberately provider-agnostic and configuration-gated: with no credentials
 * set, isJobSearchConfigured() is false and the product says so honestly rather
 * than inventing results. The only adapter today is Adzuna — a legitimate
 * aggregator across many boards with a documented REST API and a free tier, so
 * it can be validated before any paid plan.
 *
 * Nothing here scrapes a site that forbids it, and no result is trusted as
 * truth: every role a search returns is still scored against the person's own
 * approved evidence before it is shown or saved.
 */

export type JobSearchResult = {
  title: string;
  employer: string | null;
  location: string | null;
  description: string;
  url: string;
  salary: string | null;
  postedAt: string | null;
  source: string;
};

export type JobSearchQuery = {
  keywords: string;
  location?: string;
  limit?: number;
};

export type JobSearchProviderName = "adzuna";

function adzunaConfig() {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  // Adzuna scopes every query to a country. It must match the target market or
  // the search returns nothing; default to the UK index and let an operator set
  // ADZUNA_COUNTRY (gb, us, au, sg, in, …) for the deployment's audience.
  const country = (process.env.ADZUNA_COUNTRY || "gb").trim().toLowerCase();
  if (!appId || !appKey) return null;
  return { appId, appKey, country };
}

/** Which provider, if any, this deployment can actually query. */
export function activeJobSearchProvider(): JobSearchProviderName | null {
  if (adzunaConfig()) return "adzuna";
  return null;
}

export function isJobSearchConfigured(): boolean {
  return activeJobSearchProvider() !== null;
}

type AdzunaResult = {
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  created?: string;
};

function formatSalary(min?: number, max?: number): string | null {
  const lo = typeof min === "number" && min > 0 ? Math.round(min) : null;
  const hi = typeof max === "number" && max > 0 ? Math.round(max) : null;
  if (lo && hi) return `${lo.toLocaleString()}–${hi.toLocaleString()}`;
  if (lo) return `from ${lo.toLocaleString()}`;
  if (hi) return `up to ${hi.toLocaleString()}`;
  return null;
}

/** Pure mapping from one Adzuna record to Sartho's shape — kept testable. */
export function mapAdzunaResult(raw: AdzunaResult): JobSearchResult | null {
  const title = raw.title?.trim();
  const url = raw.redirect_url?.trim();
  const description = raw.description?.trim();
  if (!title || !url || !description) return null;
  return {
    title,
    employer: raw.company?.display_name?.trim() || null,
    location: raw.location?.display_name?.trim() || null,
    description,
    url,
    salary: formatSalary(raw.salary_min, raw.salary_max),
    postedAt: raw.created?.trim() || null,
    source: "Adzuna",
  };
}

export class JobSearchNotConfiguredError extends Error {
  constructor() {
    super("No jobs search provider is configured.");
    this.name = "JobSearchNotConfiguredError";
  }
}

async function searchAdzuna(query: JobSearchQuery): Promise<JobSearchResult[]> {
  const config = adzunaConfig();
  if (!config) throw new JobSearchNotConfiguredError();

  const params = new URLSearchParams({
    app_id: config.appId,
    app_key: config.appKey,
    what: query.keywords,
    results_per_page: String(Math.min(Math.max(query.limit ?? 20, 1), 50)),
    "content-type": "application/json",
  });
  if (query.location?.trim()) params.set("where", query.location.trim());

  const url = `https://api.adzuna.com/v1/api/jobs/${config.country}/search/1?${params.toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Adzuna search failed (${response.status}).`);
  }

  const body = (await response.json()) as { results?: AdzunaResult[] };
  return (body.results ?? [])
    .map(mapAdzunaResult)
    .filter((item): item is JobSearchResult => item !== null);
}

/** Query the active provider. Throws JobSearchNotConfiguredError when none is set. */
export async function searchJobs(query: JobSearchQuery): Promise<JobSearchResult[]> {
  const provider = activeJobSearchProvider();
  if (provider === "adzuna") return searchAdzuna(query);
  throw new JobSearchNotConfiguredError();
}
