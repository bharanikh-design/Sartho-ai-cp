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
export function buildSerpApiParams(query: JobSearchQuery, apiKey: string, asyncMode = false): URLSearchParams {
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

  /*
   * Submitted, not waited on. See submitSerpApiSearch below for why this one
   * parameter is the difference between a provider that works and one that
   * does not.
   */
  if (asyncMode) params.set("async", "true");

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
    /*
     * "Google hasn't returned any results for this query" arrives in the same
     * field as a spent plan and a bad key, and it is not a failure — it is an
     * answer. Thrown, it counted against the provider, and two rare titles in
     * a row retired Google for Jobs for the rest of the run and finished the
     * search on four-line blurbs. A market that simply has no ServiceNow
     * Delivery Director is a fact about the market.
     */
    if (isNoResultsMessage(payload.error)) return [];
    throw new Error(`SerpApi: ${payload.error.trim()}`);
  }
  return Array.isArray(payload.jobs_results) ? (payload.jobs_results as SerpApiJob[]) : [];
}

/** SerpApi's way of saying the search worked and Google had nothing. */
export function isNoResultsMessage(error: string): boolean {
  return /hasn'?t returned any results|no results found/i.test(error);
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

/*
 * What SerpApi says about the account itself, rather than about a search.
 *
 * A search that never returns says nothing about why. Three queries were given
 * twenty seconds each and aborted at exactly the ceiling; one was given sixty
 * and aborted at exactly sixty. A provider that behaved that way after
 * answering a first probe in 8.7 seconds is not slow, and no amount of staring
 * at search responses will say what it is — because the answer is not in them.
 *
 * It is here. SerpApi publishes the plan, the monthly allowance, what is left
 * of it, and the hourly rate limit with the last hour's usage against it. A
 * spent allowance and a tripped hourly limit are different problems with
 * different fixes, and both look exactly like a slow network from the outside.
 * That confusion has now cost this project a day twice, once on RapidAPI and
 * once here.
 */
export type SerpApiAccount = {
  plan: string | null;
  searchesPerMonth: number | null;
  searchesLeft: number | null;
  usedThisMonth: number | null;
  ratePerHour: number | null;
  usedLastHour: number | null;
  status: string | null;
};

export async function serpApiAccount(): Promise<SerpApiAccount> {
  const config = serpApiConfig();
  if (!config) throw new Error("SerpApi is not configured.");

  const response = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(config.key)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SerpApi account check returned ${response.status}`);

  const body = (await response.json()) as Record<string, unknown>;
  const num = (key: string) => (typeof body[key] === "number" ? (body[key] as number) : null);

  return {
    plan: typeof body.plan_name === "string" ? body.plan_name : null,
    searchesPerMonth: num("searches_per_month"),
    searchesLeft: num("total_searches_left") ?? num("plan_searches_left"),
    usedThisMonth: num("this_month_usage"),
    ratePerHour: num("account_rate_limit_per_hour"),
    usedLastHour: num("last_hour_searches"),
    status: typeof body.account_status === "string" ? body.account_status : null,
  };
}

/*
 * Why this provider is submitted rather than waited on.
 *
 * A search was one GET that held the connection until Google answered. A probe
 * asking "project manager" came back in 8.7 seconds and the provider looked
 * healthy; every real search — "ServiceNow Delivery Director", "ITSM manager" —
 * was aborted at exactly the ceiling it was given. Twenty seconds, then sixty,
 * run one at a time with nothing else in flight and an account with 227 of 250
 * searches left. A provider that answers a common phrase in nine seconds and
 * says nothing at all to a rare one in sixty is not a slow network and it is
 * not a spent plan.
 *
 * It is the difference between a query SerpApi has served before and one it has
 * to go and fetch live. The common phrase is cached; the rare title — which is
 * every query Sartho actually needs — is not, and on this plan a fresh search
 * is worked at whatever pace there is. Holding a socket open for it was always
 * going to lose that race.
 *
 * So the socket is not held. `async=true` makes submission return in under a
 * second with an id, and the result is collected from the archive afterwards.
 * Three things follow, and each one was a real loss before:
 *
 *   - A slow search no longer spends the run's budget. The wait is a poll that
 *     can be given up on, not a call that has to be seen through.
 *   - A search that does not finish in time is no longer thrown away. It was
 *     paid for either way — aborting the fetch never cancelled the work — and
 *     now it completes at SerpApi and warms the cache, so the next run asking
 *     the same title gets the fast answer the probe was getting all along.
 *   - Collecting from the archive is free, so picking a result up costs nothing
 *     against the allowance.
 */
const SERPAPI_ARCHIVE_ENDPOINT = "https://serpapi.com/searches";

/** Long enough to submit, short enough that a stalled submission is not the run. */
const SUBMIT_TIMEOUT_MS = 8_000;

/** One archive read. These are quick — it is a lookup, not a search. */
const COLLECT_TIMEOUT_MS = 5_000;

/*
 * Kept back so the last poll is one that can finish rather than one that dies
 * holding the budget. Small and fixed, not a share of the archive timeout: at
 * a nine-second budget, reserving half of an eight-second read threw away
 * almost half the time the query had to answer in.
 */
const POLL_RESERVE_MS = 1_500;

/*
 * How often to ask whether it is done. Backs off so a search that takes half a
 * minute is not polled thirty times, and starts fast so a cached one — which
 * is ready almost immediately — is not made to wait on an interval.
 */
export function pollDelayMs(attempt: number): number {
  return Math.min(400 * 2 ** attempt, 4_000);
}

export type SerpApiStatus = "success" | "processing" | "error";

/**
 * Where a submitted search has got to. SerpApi reports this in
 * search_metadata.status as "Success", "Processing" or "Error"; anything it has
 * not finished is treated as still running, because the alternative is giving
 * up on a search that was paid for.
 */
export function readSerpApiStatus(body: unknown): SerpApiStatus {
  if (!body || typeof body !== "object") return "processing";
  const payload = body as { search_metadata?: { status?: unknown }; error?: unknown };

  /* A real refusal — bad key, spent plan — arrives as an error with no status. */
  if (typeof payload.error === "string" && payload.error.trim() && !isNoResultsMessage(payload.error)) {
    return "error";
  }

  const status = typeof payload.search_metadata?.status === "string"
    ? payload.search_metadata.status.toLowerCase()
    : "";
  if (status === "success") return "success";
  if (status === "error") return "error";
  /*
   * No status at all means this is a synchronous response that simply came
   * back — the whole body is the result, so it is done.
   */
  return status ? "processing" : "success";
}

/** The id SerpApi hands back on submission, needed to collect the result. */
export function readSerpApiSearchId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { search_metadata?: { id?: unknown } }).search_metadata?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    /* SerpApi explains its refusals in the body; the status alone names nothing. */
    let detail = "";
    try {
      const errorBody = (await response.json()) as { error?: string };
      if (typeof errorBody?.error === "string") detail = errorBody.error;
    } catch {
      /* A non-JSON error body still leaves the status worth reporting. */
    }
    throw new Error(`SerpApi ${what} returned ${response.status}${detail ? ` — ${detail}` : ""}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`SerpApi ${what} returned a non-JSON response (${response.status}).`);
  }
}

/**
 * Hand the query over and take the ticket. Returns the search id, or the body
 * itself when SerpApi answered synchronously anyway — some plans and some
 * cached queries ignore the async flag and simply return the results, and a
 * result in hand should never be thrown away for not arriving as expected.
 */
export async function submitSerpApiSearch(
  query: JobSearchQuery,
  apiKey: string,
): Promise<{ id: string; body: null } | { id: null; body: unknown }> {
  const params = buildSerpApiParams(query, apiKey, true);
  const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const body = await readJson(response, "search");

  if (readSerpApiStatus(body) === "success") return { id: null, body };

  const id = readSerpApiSearchId(body);
  if (!id) throw new Error("SerpApi accepted the search but named no id to collect it with.");
  return { id, body: null };
}

/** One archive read. Free: it does not count against the allowance. */
export async function collectSerpApiSearch(id: string, apiKey: string): Promise<unknown> {
  const response = await fetch(
    `${SERPAPI_ARCHIVE_ENDPOINT}/${encodeURIComponent(id)}.json?api_key=${encodeURIComponent(apiKey)}`,
    { signal: AbortSignal.timeout(COLLECT_TIMEOUT_MS) },
  );
  return readJson(response, "archive");
}

/**
 * A search left running when the budget ran out.
 *
 * Thrown rather than returned empty so the caller can tell it apart from "this
 * market has no such role" — they look identical on a page and mean opposite
 * things. It is deliberately not phrased as a fault: the search is still going,
 * it was already paid for, and the next run gets it from the cache.
 */
export class SerpApiStillRunningError extends Error {
  constructor(waitedMs: number) {
    super(`SerpApi was still working on this query after ${Math.round(waitedMs / 1000)}s. It finishes at SerpApi either way, so the next search for this role reads it from cache.`);
    this.name = "SerpApiStillRunningError";
  }
}

export function jobsFromSerpApiBody(body: unknown, query: JobSearchQuery): JobSearchResult[] {
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

/**
 * Submit a query and walk away.
 *
 * The cache is the whole game on this plan: a title SerpApi has served before
 * comes back in about a second, and one it has not may not come back inside a
 * search at all. A search that gives up on a slow query still warms it — but
 * only that one, because the provider is retired for the rest of the run, so a
 * brief with six target roles would take six searches to get warm.
 *
 * This warms them all at once, at the cost of a submission each and no waiting.
 * The searches run at SerpApi after this returns, exactly as they would have
 * anyway; what is skipped is sitting on a socket watching them.
 */
export async function warmSerpApiQuery(query: JobSearchQuery): Promise<{ submitted: boolean; id: string | null; results: number }> {
  const config = serpApiConfig();
  if (!config) throw new Error("SerpApi is not configured.");

  const submitted = await submitSerpApiSearch(query, config.key);
  /* Already cached: it answered on submission, so there was nothing to warm. */
  if (submitted.id === null) {
    return { submitted: false, id: null, results: jobsFromSerpApiBody(submitted.body, query).length };
  }
  return { submitted: true, id: submitted.id, results: 0 };
}

export async function searchSerpApi(
  query: JobSearchQuery,
  /* Injected so the whole submit-and-poll loop is testable without a network. */
  deps: {
    submit?: typeof submitSerpApiSearch;
    collect?: typeof collectSerpApiSearch;
    wait?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<JobSearchResult[]> {
  const config = serpApiConfig();
  if (!config) throw new Error("SerpApi is not configured.");

  const submit = deps.submit ?? submitSerpApiSearch;
  const collect = deps.collect ?? collectSerpApiSearch;
  const now = deps.now ?? Date.now;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const budgetMs = query.timeoutMs ?? SERPAPI_TIMEOUT_MS;
  const startedAt = now();

  const submitted = await submit(query, config.key);
  /* Answered on the spot — a cached query, or a plan that ignores the flag. */
  if (submitted.id === null) return jobsFromSerpApiBody(submitted.body, query);

  for (let attempt = 0; ; attempt += 1) {
    const elapsed = now() - startedAt;
    const left = budgetMs - elapsed;
    /*
     * Stop before a poll that cannot finish. One that overruns the budget
     * spends what is left and still answers nothing, which is the trap the
     * synchronous version fell into on every query.
     */
    if (left <= POLL_RESERVE_MS) throw new SerpApiStillRunningError(elapsed);

    await wait(Math.min(pollDelayMs(attempt), left));

    const body = await collect(submitted.id, config.key);
    const status = readSerpApiStatus(body);
    if (status === "success") return jobsFromSerpApiBody(body, query);
    if (status === "error") {
      /* Reuses the reading that turns SerpApi's error field into a throw. */
      return jobsFromSerpApiBody(body, query);
    }
  }
}
