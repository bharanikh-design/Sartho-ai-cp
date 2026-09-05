-- Three things the search brief could not express, and one it could not keep.
--
--   * One country. People hold work rights in more than one, and a search that
--     can only ask about a single market cannot represent that.
--   * No employment type. Every major board filters on it, and so do both of
--     Sartho's providers — asking for it is a real filter, not decoration.
--   * Results lived in one browser tab for thirty minutes. Closing the tab
--     meant spending provider calls again to see the same roles.

begin;

alter table public.search_preferences
  -- Kept alongside the existing singular `country`, which stays as the primary
  -- market so nothing that reads it breaks.
  add column if not exists countries text[] not null default '{}',
  add column if not exists employment_types text[] not null default '{}';

comment on column public.search_preferences.countries is
  'Every ISO-3166 alpha-2 market to search. The first is the primary one.';
comment on column public.search_preferences.employment_types is
  'Full-time, Part-time, Contract, Casual, Internship, Graduate programme. Empty means any.';

-- Backfill: a saved single country becomes the first entry of the list.
update public.search_preferences
   set countries = array[country]
 where country is not null
   and coalesce(array_length(countries, 1), 0) = 0;

-- The last search, kept so returning to the page is a read rather than a
-- re-spend. One row per person: a search replaces the previous one.
create table if not exists public.search_results (
  user_id uuid primary key references auth.users(id) on delete cascade,
  results jsonb not null default '[]'::jsonb,
  criteria jsonb not null default '{}'::jsonb,
  searched_at timestamptz not null default now()
);

comment on table public.search_results is
  'The most recent live search per user, so the page can show matches without re-querying providers.';

alter table public.search_results enable row level security;

drop policy if exists "own search results" on public.search_results;
create policy "own search results"
  on public.search_results
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.search_results to authenticated;

create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.search_results where user_id = auth.uid();
  delete from public.direction_suggestion_sets where user_id = auth.uid();
  delete from public.seen_job_matches where user_id = auth.uid();
  delete from public.ai_usage_events where user_id = auth.uid();
  delete from public.applications where user_id = auth.uid();
  delete from public.jobs where user_id = auth.uid();
  delete from public.evidence_items where user_id = auth.uid();
  delete from public.career_roles where user_id = auth.uid();
  delete from public.target_lanes where user_id = auth.uid();
  delete from public.resume_imports where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
end;
$$;

revoke all on function public.wipe_my_data() from public, anon;
grant execute on function public.wipe_my_data() to authenticated;

commit;
