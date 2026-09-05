/*
 * Real opportunity inflow — querying a jobs aggregator by the search brief.
 *
 * This is the one place Sartho reaches out to a third-party jobs source. It is
 * deliberately provider-agnostic and configuration-gated: with no credentials
 * set, isJobSearchConfigured() is false and the product says so honestly rather
 * than inventing results. Two adapters exist: JSearch (Google for Jobs via
 * RapidAPI — broadest coverage, full descriptions, reaches company career
 * pages) and Adzuna (aggregator with a documented REST API and a free tier).
 *
 * Country is part of every query, never a deployment setting. Each person
 * searches the market they chose on their Search Brief; the environment only
 * supplies a last-resort default for a brief saved before that existed.
 *
 * Nothing here scrapes a site that forbids it, and no result is trusted as
 * truth: every role a search returns is still scored against the person's own
 * approved evidence before it is shown or saved.
 */

import { adzunaEmploymentParams, employmentQueryHints, jsearchEmploymentTypes } from "@/lib/jobs/employment-types";

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
  /** ISO-3166 alpha-2 job market. Falls back to the deployment default when absent. */
  country?: string;
  /** A city within the country. Absent means anywhere in the country. */
  location?: string;
  /** Restrict to one employer — a targeted company search. */
  employer?: string;
  /** Only remote / work-from-home listings. */
  remoteOnly?: boolean;
  /** Full-time, Part-time, Contract… applied as a real provider filter. */
  employmentTypes?: string[];
  limit?: number;
};

export type JobSearchProviderName = "adzuna" | "jsearch";

// Adzuna scopes every query to a country in the URL path, so a bad value 404s.
const ADZUNA_COUNTRIES = new Set([
  "gb", "us", "at", "au", "be", "br", "ca", "ch", "de", "es",
  "fr", "in", "it", "mx", "nl", "nz", "pl", "sg", "za",
]);

/**
 * Turn whatever is in ADZUNA_COUNTRY into a valid Adzuna country code. Accepts
 * a comma-list (uses the first), normalises case, maps the common "uk" → "gb",
 * and falls back to a supported default rather than sending an invalid path.
 */
export function normaliseAdzunaCountry(raw: string | undefined): string {
  const first = (raw ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  const mapped = first === "uk" ? "gb" : first;
  return ADZUNA_COUNTRIES.has(mapped) ? mapped : "gb";
}

export function adzunaCoversCountry(country: string): boolean {
  return ADZUNA_COUNTRIES.has(country.toLowerCase());
}

/**
 * The market used when a brief carries no country — only briefs saved before
 * the per-user country existed. Reads the legacy environment settings.
 */
export function defaultJobMarket(): string {
  const raw = (process.env.JSEARCH_COUNTRY || process.env.ADZUNA_COUNTRY || "us")
    .split(",")[0]?.trim().toLowerCase() ?? "us";
  return raw === "uk" ? "gb" : raw || "us";
}

function jsearchConfig() {
  const key = process.env.JSEARCH_RAPIDAPI_KEY?.trim() || process.env.RAPIDAPI_KEY?.trim();
  if (!key) return null;
  return { key };
}

function adzunaConfig() {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) return null;
  return { appId, appKey };
}

/**
 * Which provider, if any, this deployment can actually query. With both keys
 * present, JSearch (Google for Jobs — broadest coverage, including company
 * career pages) is preferred unless JOBS_SEARCH_PROVIDER pins a choice.
 */
export function activeJobSearchProvider(): JobSearchProviderName | null {
  const override = process.env.JOBS_SEARCH_PROVIDER?.trim().toLowerCase();
  if (override === "adzuna") return adzunaConfig() ? "adzuna" : null;
  if (override === "jsearch") return jsearchConfig() ? "jsearch" : null;
  if (jsearchConfig()) return "jsearch";
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

function resolveCountry(query: JobSearchQuery): string {
  const country = query.country?.trim().toLowerCase();
  return country && /^[a-z]{2}$/.test(country) ? country : defaultJobMarket();
}

/** The Adzuna request URL for a query — pure, so the criteria mapping is testable. */
export function buildAdzunaUrl(query: JobSearchQuery, credentials: { appId: string; appKey: string }): string {
  const params = new URLSearchParams({
    app_id: credentials.appId,
    app_key: credentials.appKey,
    what: query.keywords,
    results_per_page: String(Math.min(Math.max(query.limit ?? 20, 1), 50)),
    "content-type": "application/json",
  });
  if (query.location?.trim()) params.set("where", query.location.trim());
  if (query.employer?.trim()) params.set("company", query.employer.trim());
  // Adzuna has no remote flag; "remote" as a location term is the documented
  // workaround and matches how listings there are labelled.
  if (query.remoteOnly && !query.location?.trim()) params.set("where", "remote");
  for (const flag of adzunaEmploymentParams(query.employmentTypes ?? [])) params.set(flag, "1");
  const country = resolveCountry(query);
  return `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`;
}

async function searchAdzuna(query: JobSearchQuery): Promise<JobSearchResult[]> {
  const config = adzunaConfig();
  if (!config) throw new JobSearchNotConfiguredError();
  const country = resolveCountry(query);
  if (!adzunaCoversCountry(country)) {
    throw new Error(`Adzuna does not cover ${country.toUpperCase()}.`);
  }

  const response = await fetch(buildAdzunaUrl(query, config), { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Adzuna search failed (${response.status}).`);
  }

  const body = (await response.json()) as { results?: AdzunaResult[] };
  return (body.results ?? [])
    .map(mapAdzunaResult)
    .filter((item): item is JobSearchResult => item !== null);
}

type JSearchResult = {
  job_title?: string;
  employer_name?: string;
  job_description?: string;
  job_apply_link?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_posted_at_datetime_utc?: string;
  job_min_salary?: number;
  job_max_salary?: number;
};

/** Pure mapping from one JSearch (Google for Jobs) record to Sartho's shape. */
export function mapJSearchResult(raw: JSearchResult): JobSearchResult | null {
  const title = raw.job_title?.trim();
  const url = raw.job_apply_link?.trim();
  const description = raw.job_description?.trim();
  if (!title || !url || !description) return null;
  const location = [raw.job_city, raw.job_state, raw.job_country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ") || null;
  return {
    title,
    employer: raw.employer_name?.trim() || null,
    location,
    description,
    url,
    salary: formatSalary(raw.job_min_salary, raw.job_max_salary),
    postedAt: raw.job_posted_at_datetime_utc?.trim() || null,
    source: "Google for Jobs",
  };
}

/**
 * The JSearch request parameters for a query — pure, so the criteria mapping
 * is testable. JSearch takes one free-text query: the employer and city ride
 * inside it, the way a person would type them into Google.
 */
export function buildJSearchParams(query: JobSearchQuery): URLSearchParams {
  let text = query.keywords.trim();
  const hints = employmentQueryHints(query.employmentTypes ?? []);
  if (hints.length) text = `${text} ${hints.join(" ")}`;
  if (query.employer?.trim()) text = `${text} at ${query.employer.trim()}`;
  if (query.location?.trim()) text = `${text} in ${query.location.trim()}`;
  const params = new URLSearchParams({
    query: text,
    num_pages: "1",
    date_posted: "all",
    country: resolveCountry(query),
  });
  if (query.remoteOnly) params.set("work_from_home", "true");
  const employment = jsearchEmploymentTypes(query.employmentTypes ?? []);
  if (employment) params.set("employment_types", employment);
  return params;
}

async function searchJSearch(query: JobSearchQuery): Promise<JobSearchResult[]> {
  const config = jsearchConfig();
  if (!config) throw new JobSearchNotConfiguredError();

  // JSearch v5's endpoint is /search-v2 (the old /search 404s with
  // "endpoint does not exist"). Headers mirror RapidAPI's own snippet; JSearch
  // can take ~25s to answer, so the timeout is generous.
  const response = await fetch(`https://jsearch.p.rapidapi.com/search-v2?${buildJSearchParams(query).toString()}`, {
    method: "GET",
    headers: {
      "x-rapidapi-key": config.key,
      "x-rapidapi-host": "jsearch.p.rapidapi.com",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // Surface RapidAPI's own reason (e.g. "You are not subscribed to this API")
    // so a configuration mistake is diagnosable instead of a blank 502.
    let detail = "";
    try {
      const errorBody = (await response.json()) as { message?: string };
      if (typeof errorBody?.message === "string") detail = errorBody.message;
    } catch {
      // non-JSON error body; the status alone still helps.
    }
    // A masked key fingerprint (never the full value) so a bad paste is
    // diagnosable: a real RapidAPI key is 50 chars. Anything else is the cause.
    const key = config.key;
    const keyHint = `key ${key.length}ch ${key.slice(0, 3)}…${key.slice(-3)}`;
    throw new Error(`JSearch returned ${response.status}${detail ? ` — ${detail}` : ""} [${keyHint}]`);
  }

  const body = (await response.json()) as { data?: JSearchResult[] };
  return (body.data ?? [])
    .map(mapJSearchResult)
    .filter((item): item is JobSearchResult => item !== null);
}

/**
 * Every configured provider, in fall-back order. JSearch leads (broadest
 * coverage) but if it fails at request time the caller can drop to Adzuna, so
 * one provider being down does not take search down. JOBS_SEARCH_PROVIDER pins
 * a single provider when set.
 */
export function configuredJobSearchProviders(): JobSearchProviderName[] {
  // Every provider that is actually configured. JSearch (Google for Jobs) leads
  // by default: it returns full job descriptions, so the evidence match is
  // meaningful, and it reaches company career pages. Adzuna — whose short
  // blurbs flatten every score — stays on as the fallback.
  const configured: JobSearchProviderName[] = [];
  if (jsearchConfig()) configured.push("jsearch");
  if (adzunaConfig()) configured.push("adzuna");

  // JOBS_SEARCH_PROVIDER is a *preference*, not a lock: the named provider is
  // tried first, but every other configured provider stays on as a fallback so
  // one provider being down can never take search down.
  const pin = process.env.JOBS_SEARCH_PROVIDER?.trim().toLowerCase();
  if ((pin === "jsearch" || pin === "adzuna") && configured.includes(pin)) {
    return [pin, ...configured.filter((provider) => provider !== pin)];
  }
  return configured;
}

/**
 * The configured providers that can actually search a given country. JSearch
 * covers any market; Adzuna only the countries it has an endpoint for, so it
 * is dropped rather than sent a request that would 404.
 */
export function providersForCountry(country: string, configured = configuredJobSearchProviders()): JobSearchProviderName[] {
  return configured.filter((provider) => provider !== "adzuna" || adzunaCoversCountry(country));
}

export async function searchWithProvider(
  provider: JobSearchProviderName,
  query: JobSearchQuery,
): Promise<JobSearchResult[]> {
  if (provider === "jsearch") return searchJSearch(query);
  return searchAdzuna(query);
}

/** Query the active provider. Throws JobSearchNotConfiguredError when none is set. */
export async function searchJobs(query: JobSearchQuery): Promise<JobSearchResult[]> {
  const provider = activeJobSearchProvider();
  if (provider === "jsearch") return searchJSearch(query);
  if (provider === "adzuna") return searchAdzuna(query);
  throw new JobSearchNotConfiguredError();
}
