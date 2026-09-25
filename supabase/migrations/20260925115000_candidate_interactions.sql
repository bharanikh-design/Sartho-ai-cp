-- Durable interaction memory for Candidate Context learning.
--
-- This table records what happened. It does not itself decide what the user
-- prefers. The learning layer derives cautious affinity later, keeping raw
-- events immutable and auditable.

create table if not exists public.candidate_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  event_type text not null check (event_type in (
    'search_result_viewed',
    'search_result_saved',
    'job_imported',
    'job_opened',
    'deep_analysis_requested',
    'status_applied',
    'status_assessment',
    'status_interview',
    'status_offer',
    'status_withdrawn',
    'status_rejected'
  )),
  source text not null check (source in ('search','extension','pipeline')),
  title text not null,
  employer text,
  location text,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists candidate_interactions_user_time_idx
  on public.candidate_interactions (user_id, occurred_at desc);

create index if not exists candidate_interactions_user_job_idx
  on public.candidate_interactions (user_id, job_id, occurred_at desc);

alter table public.candidate_interactions enable row level security;

drop policy if exists "own candidate interactions" on public.candidate_interactions;
create policy "own candidate interactions"
  on public.candidate_interactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.candidate_interactions from anon;
grant select, insert on table public.candidate_interactions to authenticated;

comment on table public.candidate_interactions is
  'Immutable user interaction and market outcome events used to derive learned affinity without overwriting explicit career truth.';
