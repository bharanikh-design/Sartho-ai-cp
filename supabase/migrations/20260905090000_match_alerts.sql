-- Match alerts: Sartho runs each person's saved search brief on a schedule and
-- emails only the roles it has not shown them before.
--
-- The seen table is what makes the email worth opening: a listing is emailed
-- once, ever. It is written by the scheduled job (service role) and readable by
-- its owner, so the app can mark a result as already sent.

begin;

alter table public.notification_preferences
  add column if not exists match_alerts_enabled boolean not null default false,
  add column if not exists match_alerts_last_run_at timestamptz,
  add column if not exists match_alerts_last_test_at timestamptz;

comment on column public.notification_preferences.match_alerts_enabled is
  'Email new strong matches from a scheduled run of the saved search brief.';

create table if not exists public.seen_job_matches (
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null check (char_length(url) between 8 and 2048),
  title text not null,
  employer text,
  location text,
  overall_match integer not null default 0,
  recommendation text not null default 'skip',
  source text,
  first_seen_at timestamptz not null default now(),
  emailed_at timestamptz,
  primary key (user_id, url)
);

comment on table public.seen_job_matches is
  'Every listing a scheduled search has surfaced for a person, so nothing is emailed twice.';

create index if not exists seen_job_matches_user_seen_idx
  on public.seen_job_matches (user_id, first_seen_at desc);

alter table public.seen_job_matches enable row level security;

drop policy if exists "own seen matches" on public.seen_job_matches;
create policy "own seen matches"
  on public.seen_job_matches
  for select to authenticated
  using (auth.uid() = user_id);

grant select on table public.seen_job_matches to authenticated;

commit;
