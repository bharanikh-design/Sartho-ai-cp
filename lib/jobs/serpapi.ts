import { countryName } from "@/lib/jobs/countries";
import type { JobSearchQuery, JobSearchResult } from "@/lib/jobs/search-provider";

/*
 * Google for Jobs, bought from the vendor rather than from a reseller.
 *
 * Sartho already reads Google for Jobs through JSearch on RapidAPI, and that
 * arrangement cost a day: the marketplace answered a spent monthly allowance by
 * stalling rather than refusing, so an exhausted quota looked like a slow
 * network for hours. SerpApi runs the same index and sells it directly, which
 * removes the middle layer that was doing the stalling.
 *
 * The reason to want either of them is the description. Adzuna returns a
 * marketing blurb of a few lines, and Sartho scores a person against the
 * requirements it can read — so a shallow record does not merely rank lower,
 * it makes every score meaningless. "60% of the 5 requirements legible in this
 * advert" is not a judgement about a career; it is a judgement about five
 * lines. Google for Jobs carries the whole advert.
 */

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

/** Long enough for a search that reaches Google, short enough to leave a budget. */
const SERPAPI_TIMEOUT_MS = 15_000;

export function serpApiConfig() {
  const key = process.env.SERPAPI_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim();
  return key ? { key } : null;
}

/*
 * One free-text query, the way somebody would type it into Google.
 *
 * `location` is Google's own place string rather than a country code, so the
 * market's name is used where Sartho has one. The employer rides inside the
 * query text for the same reason it does on the other two providers: an
 * employer filter that each provider spells differently is three chances to
 * send one of them something it refuses.
 */
export function buildSerpApiParams(query: JobSearchQuery, apiKey: string): URLSearchParams {
  let text = query.keywords.trim();
  if (query.employer?.trim()) text = `${text} ${query.employer.trim()}`;

  /*
   * Nothing about employment type goes into the query. It is read back off the
   * results instead, in keepScheduleTypes below.
   *
   * This has now been wrong twice, in opposite directions, and both times the
   * whole search returned nothing.
   *
   * First it was a `chips` parameter built by hand — `employment_type:FULLTIME`,
   * the vocabulary JSearch uses. But a chip is an opaque token Google mints for
   * one particular search and hands back in that response; it cannot be
   * composed by a caller, and a chip Google never issued returns nothing.
   *
   * Then it was the words "full time" appended to the query, on the reasoning
   * that Google's free text would handle them. It does handle them — as words
   * it expects to find. "Servicenow Delivery Director full time" is a four-term
   * match against a title that is rare to begin with, and Google answered it
   * exactly as it had answered the bad chip: "Google hasn't returned any
   * results for this query".
   *
   * The lesson both times is that this is a search engine over job titles, and
   * every term added to a query is a term that must be matched. Employment
   * type is not a title, so it does not belong in one. Google already reports
   * each listing's schedule_type, so the filter belongs after the results, not
   * before them — where it is a real filter rather than a hint, and costs the
   * query nothing.
   */

  const params = new URLSearchParams({
    engine: "google_jobs",
    q: text,
    api_key: apiKey,
    hl: "en",
  });

  const place = query.location?.trim() || countryName(query.country ?? "") || "";
  if (place) params.set("location", place);
  if (query.country?.trim()) params.set("gl", query.country.trim().toLowerCase());

  return params;
}

type SerpApiJob = {
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  via?: string;
  job_id?: string;
  share_link?: string;
  detected_extensions?: { posted_at?: string; salary?: string; schedule_type?: string };
  extensions?: string[];
  apply_options?: Array<{ title?: string; link?: string }>;
};

/*
 * The boards carrying one advert, and whether the employer's own site is among
 * them. Google names the publisher in `via` ("via LinkedIn") and lists every
 * apply route in apply_options — which is the difference between "there is a
 * job" and "here is where to apply for it without a third-party form".
 */
export function readSerpApiPlatforms(raw: SerpApiJob): { platforms: string[]; applyDirect: boolean } {
  const names: string[] = [];
  const via = (raw.via ?? "").replace(/^via\s+/i, "").trim();
  if (via) names.push(via);
  for (const option of raw.apply_options ?? []) {
    const name = (option?.title ?? "").trim();
    if (name && name.length <= 60) names.push(name);
  }

  const seen = new Set<string>();
  const platforms: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    platforms.push(name);
    if (platforms.length === 5) break;
  }

  /*
   * The employer's own site, recognised by its name appearing as an apply
   * route. Google does not flag it, so this is a reading rather than a fact —
   * and it only ever adds a hint, never removes a result.
   */
  const employer = (raw.company_name ?? "").trim().toLowerCase();
  const applyDirect = Boolean(employer) && platforms.some((name) => name.toLowerCase().includes(employer));

  return { platforms, applyDirect };
}

/** Pure mapping from one SerpApi record to Sartho's shape — kept testable. */
export function mapSerpApiResult(raw: SerpApiJob): JobSearchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const title = raw.title?.trim();
  const description = raw.description?.trim();
  if (!title || !description) return null;

  /*
   * A direct apply link beats the Google share link, which opens a listing
   * page rather than an application. Without either there is nowhere to send
   * anybody, and a card with no link is a tease.
   */
  const url = (raw.apply_options ?? []).map((option) => option?.link?.trim()).find(Boolean)
    ?? raw.share_link?.trim();
  if (!url) return null;

  const { platforms, applyDirect } = readSerpApiPlatforms(raw);

  return {
    title,
    employer: raw.company_name?.trim() || null,
    location: raw.location?.trim() || null,
    description,
    url,
    salary: raw.detected_extensions?.salary?.trim() || null,
    /*
     * Google reports this as "3 days ago" rather than a date. Kept as written
     * rather than converted to a timestamp Sartho would be inventing.
     */
    postedAt: raw.detected_extensions?.posted_at?.trim() || null,
    source: "Google for Jobs",
    platforms,
    applyDirect,
  };
}

/*
 * Pull the job list out of whatever shape came back.
 *
 * SerpApi answers 200 with an `error` string for a spent plan or a bad key, so
 * a failure can arrive looking like a success with no jobs in it. That is the
 * exact shape of the problem that made an exhausted RapidAPI quota look like a
 * slow network, so it is read explicitly here and thrown rather than returned
 * as an empty page.
 */
export function extractSerpApiJobs(body: unknown): SerpApiJob[] {
  if (!body || typeof body !== "object") return [];
  const payload = body as { error?: unknown; jobs_results?: unknown; search_metadata?: { status?: string } };

  if (typeof payload.error === "string" && payload.error.trim()) {
    throw new Error(`SerpApi: ${payload.error.trim()}`);
  }
  return Array.isArray(payload.jobs_results) ? (payload.jobs_results as SerpApiJob[]) : [];
}

/*
 * Google's own word for the listing's working pattern, as it reports it:
 * "Full-time", "Part-time", "Contractor", "Internship". Matched loosely
 * because the spelling varies by market and a hyphen should not lose a job.
 */
const SCHEDULE_WORDS: Record<string, string[]> = {
  "Full-time": ["full time", "fulltime", "permanent"],
  "Part-time": ["part time", "parttime"],
  Contract: ["contract", "contractor", "temporary", "temp"],
  Permanent: ["permanent", "full time", "fulltime"],
  Internship: ["intern", "internship"],
  "Graduate programme": ["intern", "internship", "graduate"],
};

/**
 * Keep only the listings whose reported schedule matches what was asked for.
 *
 * A listing Google says nothing about is kept. Most of them say nothing, and
 * dropping a job because its advert omitted a field would throw away more than
 * the filter could ever be worth — the same reasoning as reporting how many
 * adverts the years filter could actually read, rather than implying it read
 * them all.
 */
export function keepScheduleTypes(jobs: SerpApiJob[], selected: string[]): SerpApiJob[] {
  const wanted = selected.flatMap((id) => SCHEDULE_WORDS[id] ?? []);
  if (!wanted.length) return jobs;

  return jobs.filter((job) => {
    const schedule = (job.detected_extensions?.schedule_type ?? "").toLowerCase().replace(/[\s-]+/g, " ").trim();
    if (!schedule) return true;
    return wanted.some((word) => schedule.includes(word));
  });
}

export async function searchSerpApi(query: JobSearchQuery): Promise<JobSearchResult[]> {
  const config = serpApiConfig();
  if (!config) throw new Error("SerpApi is not configured.");

  const response = await fetch(`${SERPAPI_ENDPOINT}?${buildSerpApiParams(query, config.key).toString()}`, {
    signal: AbortSignal.timeout(query.timeoutMs ?? SERPAPI_TIMEOUT_MS),
  });

  if (!response.ok) {
    /* SerpApi explains its refusals in the body; the status alone names nothing. */
    let detail = "";
    try {
      const errorBody = (await response.json()) as { error?: string };
      if (typeof errorBody?.error === "string") detail = errorBody.error;
    } catch {
      /* A non-JSON error body still leaves the status worth reporting. */
    }
    throw new Error(`SerpApi returned ${response.status}${detail ? ` — ${detail}` : ""}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`SerpApi returned a non-JSON response (${response.status}).`);
  }

  /*
   * Filtered after the fact, and not on the early-career pass: a full-time
   * filter and a request for internships cancel each other out, which is the
   * same reason Adzuna's flags are dropped there.
   */
  const jobs = extractSerpApiJobs(body);
  const kept = query.earlyCareerOnly ? jobs : keepScheduleTypes(jobs, query.employmentTypes ?? []);

  return kept
    .map(mapSerpApiResult)
    .filter((item): item is JobSearchResult => item !== null);
}
