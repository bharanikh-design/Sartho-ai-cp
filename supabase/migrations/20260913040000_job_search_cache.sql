begin;

/*
 * A shared memory of what Google for Jobs answered.
 *
 * SerpApi's free plan answers a query it has served before in about three
 * seconds and one it has not in more time than a search has to give. A measured
 * search submitted three queries, two never came back, and the page was carried
 * entirely by four-line blurbs. Warming the titles by hand fixed it for about an
 * hour — SerpApi's own cache is short — and by the next morning every one of
 * them was cold again.
 *
 * So the answer is kept here rather than rented by the hour.
 *
 * Three things follow, and the third is why this is a table and not a per-user
 * column:
 *
 *   - A submitted search is never wasted. Reading a result out of SerpApi's
 *     archive is free and does not count against the allowance, so a query that
 *     outran one search's budget is collected by the next one for nothing. Two
 *     hundred and fifty searches a month stop being two hundred and fifty
 *     expiring answers and become two hundred and fifty kept ones.
 *
 *   - A stale answer beats no answer. Adverts change over days, not minutes, so
 *     a day-old reading is served at once and refreshed behind the person.
 *
 *   - It is not per person. "Engagement Manager, Singapore" returns the same
 *     adverts whoever asked, so one person's search warms that title for
 *     everybody, and the rows hold nothing about who ran the query. That is the
 *     privacy property and the compounding one at the same time.
 */
create table if not exists public.job_search_cache (
  signature text primary key,
  /*
   * SerpApi's listings exactly as they arrived, unfiltered.
   *
   * Deliberately raw. The employment-type filter is applied to results after
   * the fact, so storing a filtered copy would mean a row per combination of
   * filters and would throw away the sharing this table exists for. Each reader
   * filters the copy it takes.
   */
  listings jsonb,
  collected_at timestamptz,
  /* An outstanding async ticket: submitted, not yet read. */
  serpapi_search_id text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.job_search_cache is
  'Shared Google for Jobs answers, keyed by the query rather than by the person who asked. Holds no user identity by design.';
comment on column public.job_search_cache.signature is
  'Normalised keywords|employer|location|country. See cacheSignature in lib/jobs/search-cache.ts.';
comment on column public.job_search_cache.serpapi_search_id is
  'A submitted SerpApi search not yet collected. Collecting from the archive is free, so an outstanding ticket is always worth reading before paying for another search.';

/* Finding the rows worth refreshing without scanning the table. */
create index if not exists job_search_cache_collected_at_idx
  on public.job_search_cache (collected_at);
create index if not exists job_search_cache_pending_idx
  on public.job_search_cache (submitted_at)
  where serpapi_search_id is not null and listings is null;

alter table public.job_search_cache enable row level security;

/*
 * Readable by anyone signed in, and written by no one.
 *
 * The rows are public job adverts with no person attached, so there is nothing
 * here to scope to an owner. Writes go through the service role from the search
 * path instead: a client that could write this table could poison every user's
 * results at once, which is a far worse trade than the convenience.
 */
create policy "cached adverts are readable"
  on public.job_search_cache
  for select to authenticated
  using (true);

grant select on table public.job_search_cache to authenticated;

commit;
