-- When somebody was last actually using Sartho, and for how long.
--
-- Nearly everything an operator wants about a person is already derivable:
-- their name and location from profiles, their email and their first and last
-- sign-in from auth.users, and how far they got from whether the rows exist —
-- a completed résumé import, an active target lane, a saved search brief, a
-- notification preference. None of that needs storing twice.
--
-- Two things are not derivable, and this table is for exactly those.
--
--   * LAST ACTIVE is not last sign-in. auth.users.last_sign_in_at records the
--     last time somebody authenticated, and sessions persist for weeks — so a
--     person can use Sartho every day for a month while that column sits
--     unchanged. Reporting it as "last active" would be wrong in the flattering
--     direction, which is the worst direction for a number a founder quotes.
--
--   * TIME SPENT is measured nowhere. The admin page previously pointed at the
--     Vercel dashboard for it, which is a different thing measured a different
--     way and attributable to nobody in particular.
--
-- One row per person, updated by a heartbeat from the browser. Deliberately not
-- an event log: a row per page view would be a far more invasive record of
-- somebody's job search than this product has any reason to hold, and answers
-- no question that is being asked.

begin;

create table if not exists public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- The first heartbeat, which is not the same as the account's creation:
  -- it is the first time they actually opened the product after signing up.
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Whole seconds with Sartho open and in the foreground. Accrued by capped
  -- increments so a tab left open overnight cannot count as a night's use.
  active_seconds integer not null default 0 check (active_seconds >= 0),
  -- Separated by a gap long enough to count as coming back, not a page change.
  visit_count integer not null default 0 check (visit_count >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.user_activity is
  'Per-person engagement: when they were last actually using Sartho and for how long. Not an event log — one row per person, no page-level history.';
comment on column public.user_activity.active_seconds is
  'Seconds with Sartho open and in the foreground, accrued in capped increments. Deliberately under-counts rather than over-counts.';

alter table public.user_activity enable row level security;

-- Somebody may see and write their own row and no one else's. Operator views
-- read across accounts through the service role, never through this policy.
drop policy if exists "own activity" on public.user_activity;
create policy "own activity"
  on public.user_activity
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table public.user_activity to authenticated;

-- The operator table sorts by most recently active, over every row.
create index if not exists user_activity_last_seen_idx
  on public.user_activity(last_seen_at desc);

-- Deleting an account must take this with it. The cascade above handles the
-- foreign key; wipe_my_data is the in-product "erase everything" path and had
-- no idea this table existed.
create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_activity where user_id = auth.uid();
  delete from public.search_results where user_id = auth.uid();
  delete from public.direction_suggestion_sets where user_id = auth.uid();
  delete from public.seen_job_matches where user_id = auth.uid();
  delete from public.ai_usage_events where user_id = auth.uid();
  delete from public.resume_versions where user_id = auth.uid();
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
