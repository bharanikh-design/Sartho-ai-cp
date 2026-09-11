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

import { countryName } from "@/lib/jobs/countries";
import { adzunaEmploymentParams, employmentQueryHints, jsearchEmploymentTypes } from "@/lib/jobs/employment-types";

export type JobSearchResult = {
  title: string;
  employer: string | null;
  location: string | null;
  description: string;
  url: string;
  salary: string | null;
  postedAt: string | null;
  /** The provider Sartho queried — provenance, not the board carrying the ad. */
  source: string;
  /** The boards this advert appears on: LinkedIn, Indeed, the employer's site. */
  platforms: string[];
  /** Whether one of those is the employer's own site. */
  applyDirect: boolean;
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
  /** This query chases internships and graduate programmes; skip conflicting flags. */
  earlyCareerOnly?: boolean;
  /**
   * Ways this market says "just graduated" — "graduate scheme", "fresher",
   * "new grad". Sent as alternatives the provider ORs together, never as extra
   * required words: a term a provider ignores then costs nothing, where an
   * extra required word would empty the page.
   */
  entryLevelTerms?: string[];
  /** 
   * Skills or strengths from the user's resume/evidence. 
   * Used to heavily contextualize generic job titles (e.g., 'Business Analyst' + 'SQL, Python').
   */
  resumeSkills?: string[];
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
  if (!raw || typeof raw !== "object") return null;
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
    /*
     * Adzuna's search response names no other board, so claiming one would be
     * inventing it. An empty list means "not known", and the card says nothing
     * rather than something false.
     */
    platforms: [],
    applyDirect: false,
  };
}

export class JobSearchNotConfiguredError extends Error {
  constructor() {
    super("No jobs search provider is configured.");
    this.name = "JobSearchNotConfiguredError";
  }
}

function resolveCountry(query: JobSearchQuery): string {
  const c = query.country?.trim().toLowerCase();
  if (c === "australia") return "au";
  if (c === "united kingdom" || c === "uk") return "gb";
  if (c === "united states" || c === "us" || c === "usa") return "us";
  return c && /^[a-z]{2}$/.test(c) ? c : defaultJobMarket();
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
  /*
   * Hints only on the pass that asks for them. Folding "internship graduate
   * program" into every query would poison the ordinary full-time searches,
   * which is the opposite of the problem being fixed.
   */
  if (query.earlyCareerOnly) {
    const hints = employmentQueryHints(query.employmentTypes ?? [], "adzuna");
    if (hints.length) params.set("what", `${query.keywords} ${hints.join(" ")}`.trim());
    /*
     * The market's own words for a graduate role go in `what_or`, not `what`.
     *
     * `what` ANDs its terms, so appending "graduate scheme fresher new grad"
     * there would demand an advert containing all of them, which is no advert
     * at all. `what_or` narrows to postings carrying any one of them, on top of
     * the role in `what` — and if Adzuna ever stops honouring the parameter,
     * the query degrades to the plain role search rather than to nothing.
     */
    const terms = query.entryLevelTerms?.filter((term) => term.trim()) ?? [];
    if (terms.length) params.set("what_or", terms.join(" "));
  }
  if (query.location?.trim()) params.set("where", query.location.trim());
  if (query.employer?.trim()) params.set("company", query.employer.trim());
  // Adzuna has no remote flag; "remote" as a location term is the documented
  // workaround and matches how listings there are labelled.
  if (query.remoteOnly && !query.location?.trim()) params.set("where", "remote");
  /*
   * Adzuna ANDs its flags, so full_time=1 and permanent=1 exclude the
   * internships and graduate programmes selected alongside them. When the
   * caller marks a query as the early-career pass, the conflicting flags are
   * left off and the words carry it instead — otherwise the two selections
   * cancel each other out and the search returns neither.
   */
  if (!query.earlyCareerOnly) {
    for (const flag of adzunaEmploymentParams(query.employmentTypes ?? [])) params.set(flag, "1");
  }
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

  let body: { results?: AdzunaResult[] };
  try {
    body = (await response.json()) as { results?: AdzunaResult[] };
  } catch {
    throw new Error(`Adzuna returned non-JSON response (${response.status}).`);
  }
  const rawResults = Array.isArray(body?.results) ? body.results : [];
  return rawResults
    .map(mapAdzunaResult)
    .filter((item): item is JobSearchResult => item !== null);
}

type JSearchResult = {
  job_title?: string;
  employer_name?: string;
  job_description?: string;
  job_apply_link?: string;
  job_google_link?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_posted_at_datetime_utc?: string;
  job_min_salary?: number;
  job_max_salary?: number;
  /*
   * Where else this advert is listed. Google for Jobs is an index, not a
   * board — it finds the same posting on LinkedIn, on Indeed and on the
   * employer's own site, and names each one. Both of these were being
   * discarded, which is why Sartho could never say "this is also on LinkedIn".
   */
  job_publisher?: string;
  apply_options?: Array<{ publisher?: string; apply_link?: string; is_direct?: boolean }>;
};

/*
 * The boards carrying an advert, and whether one of them is the employer.
 *
 * Worth surfacing for a reason beyond completeness: applying on the company's
 * own site usually beats applying through an aggregator, because the
 * aggregator's form is a second copy of your details that a recruiter may
 * never open. A graduate deciding where to spend the next twenty minutes
 * should be told which link is the direct one.
 */
export function readPlatforms(raw: JSearchResult): { platforms: string[]; applyDirect: boolean } {
  const applyOptions = Array.isArray(raw.apply_options) ? raw.apply_options : [];
  const named = [
    raw.job_publisher,
    ...applyOptions.map((option) => option?.publisher),
  ];

  const platforms: string[] = [];
  for (const name of named) {
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean || clean.length > 40) continue;
    /* Case-insensitively unique: "LinkedIn" and "Linkedin" are one board. */
    if (platforms.some((existing) => existing.toLowerCase() === clean.toLowerCase())) continue;
    platforms.push(clean);
    if (platforms.length === 5) break;
  }

  return {
    platforms,
    applyDirect: applyOptions.some((option) => option?.is_direct === true),
  };
}

/** Pure mapping from one JSearch (Google for Jobs) record to Sartho's shape. */
export function mapJSearchResult(raw: JSearchResult): JobSearchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const title = raw.job_title?.trim();
  const applyOptions = Array.isArray(raw.apply_options) ? raw.apply_options : [];
  const url = (raw.job_apply_link || raw.job_google_link || applyOptions[0]?.apply_link)?.trim();
  const description = raw.job_description?.trim();
  
  const employer = raw.employer_name?.trim();
  const finalUrl = url || (title ? `https://www.google.com/search?q=${encodeURIComponent(`${title} ${employer || ""} job`.trim())}` : undefined);
  
  if (!title || !finalUrl || !description) return null;
  const location = [raw.job_city, raw.job_state, raw.job_country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ") || null;
  const { platforms, applyDirect } = readPlatforms(raw);
  return {
    title,
    employer: raw.employer_name?.trim() || null,
    location,
    description,
    url: finalUrl,
    salary: formatSalary(raw.job_min_salary, raw.job_max_salary),
    postedAt: raw.job_posted_at_datetime_utc?.trim() || null,
    /*
     * Where Sartho looked, not where the advert lives. Google for Jobs is the
     * index; the boards carrying it are in `platforms`, which is a different
     * claim and should not be collapsed into this one.
     */
    source: "Google for Jobs",
    platforms,
    applyDirect,
  };
}

/**
 * The JSearch request parameters for a query — pure, so the criteria mapping
 * is testable. JSearch takes one free-text query: the employer and city ride
 * inside it, the way a person would type them into Google.
 */
export function buildJSearchParams(query: JobSearchQuery): URLSearchParams {
  let text = query.keywords.trim();
  if (query.employer?.trim()) text = `${text} at ${query.employer.trim()}`;
  if (query.location?.trim()) {
    text = `${text} in ${query.location.trim()}`;
  } else {
    const name = countryName(query.country);
    if (name) text = `${text} in ${name}`;
  }
  const params = new URLSearchParams({
    query: text,
    page: "1",
    num_pages: "1",
    country: resolveCountry(query),
  });
  if (query.remoteOnly) params.set("work_from_home", "true");
  if (!query.earlyCareerOnly) {
    const employment = jsearchEmploymentTypes(query.employmentTypes ?? []);
    if (employment) params.set("employment_types", employment);
  }
  return params;
}

let cachedJSearchEndpoint: "search" | "search-v2" | null = "search-v2";

async function searchJSearch(query: JobSearchQuery): Promise<JobSearchResult[]> {
  const config = jsearchConfig();
  if (!config) throw new JobSearchNotConfiguredError();

  const searchParams = buildJSearchParams(query).toString();
  const headers = {
    "x-rapidapi-key": config.key,
    "x-rapidapi-host": "jsearch.p.rapidapi.com",
  };

  // Primary endpoint on RapidAPI for JSearch v5 is /search-v2.
  // Cache the working endpoint so we don't encounter redundant round-trips.
  const endpoint = cachedJSearchEndpoint ?? "search-v2";
  let response = await fetch(`https://jsearch.p.rapidapi.com/${endpoint}?${searchParams}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(12_000),
  });

  if (response.status === 404 && endpoint === "search-v2") {
    cachedJSearchEndpoint = "search";
    response = await fetch(`https://jsearch.p.rapidapi.com/search?${searchParams}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(12_000),
    });
  } else if (response.ok && cachedJSearchEndpoint === null) {
    cachedJSearchEndpoint = "search-v2";
  }
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

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`JSearch returned non-JSON response (${response.status})`);
  }

  return extractJSearchJobs(body)
    .map(mapJSearchResult)
    .filter((item): item is JobSearchResult => item !== null);
}

/**
 * Safely extracts JSearch job listing records from various API response shapes.
 *
 * RapidAPI JSearch returns `{ status: "OK", data: JSearchResult[] }` on success,
 * but can return `{ status: "OK", data: {} }` on empty results or wrapped shapes
 * like `{ data: { jobs: [...] } }`. If an error payload is returned with HTTP 200,
 * this throws a descriptive error with the API message so telemetry captures it
 * rather than throwing a TypeError.
 */
export function extractJSearchJobs(body: unknown): JSearchResult[] {
  if (!body || typeof body !== "object") return [];

  const record = body as Record<string, unknown>;

  // Check for explicit API error fields even if HTTP status was 200
  if (record.status === "ERROR" || record.error) {
    let detail = "";
    const errorObj = record.error;
    if (typeof errorObj === "string") {
      detail = errorObj;
    } else if (errorObj && typeof errorObj === "object") {
      const errRecord = errorObj as Record<string, unknown>;
      if (typeof errRecord.message === "string") {
        detail = errRecord.message;
      } else if (typeof errRecord.code === "string" || typeof errRecord.code === "number") {
        detail = String(errRecord.code);
      }
    }
    if (!detail && typeof record.message === "string") {
      detail = record.message;
    }
    if (!detail && record.data && typeof record.data === "object") {
      const dataRecord = record.data as Record<string, unknown>;
      if (typeof dataRecord.error === "string") detail = dataRecord.error;
      else if (typeof dataRecord.message === "string") detail = dataRecord.message;
    }
    if (detail) {
      throw new Error(detail);
    }
    if (record.status === "ERROR") {
      throw new Error("JSearch API returned status: ERROR");
    }
  }

  // 1. Standard JSearch response: body.data is an array
  if (Array.isArray(record.data)) {
    return record.data as JSearchResult[];
  }

  // 2. Nested dictionary in data (e.g. data.jobs, data.results, or empty dictionary {})
  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.jobs)) return nested.jobs as JSearchResult[];
    if (Array.isArray(nested.results)) return nested.results as JSearchResult[];
    if (Array.isArray(nested.data)) return nested.data as JSearchResult[];
    if (typeof nested.error === "string") throw new Error(nested.error);
    if (typeof nested.message === "string") throw new Error(nested.message);
    // Non-array data object (e.g. empty dictionary {} when zero results match)
    return [];
  }

  // 3. Top-level array
  if (Array.isArray(body)) {
    return body as JSearchResult[];
  }

  // 4. Top-level jobs / results array
  if (Array.isArray(record.jobs)) {
    return record.jobs as JSearchResult[];
  }
  if (Array.isArray(record.results)) {
    return record.results as JSearchResult[];
  }

  return [];
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
