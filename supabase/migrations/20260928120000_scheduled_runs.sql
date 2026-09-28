begin;

-- A record of every scheduled run, so silence can be told from success.
--
-- The two scheduled emails failed on every invocation for weeks and nothing
-- said so: the only evidence was per-person "last sent" timestamps, which are
-- also blank on a quiet day. A run that starts writes a row here; a run that
-- finishes closes it. The health endpoint and the diagnostics page read the
-- rows to say when each job last ran and last succeeded, and each job reads
-- them to notice when the other has gone quiet.
--
-- Server-only, like integration_connections: RLS is enabled and no policy is
-- created, and the grants are revoked besides. Only the service role writes
-- or reads this, and nothing in it is about a person.

create table if not exists public.scheduled_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  -- Counts only: sent, failed, skipped. Never an address or a person's id.
  summary jsonb not null default '{}'::jsonb,
  -- The failure, in words, truncated by the application. Never a token or key.
  error text
);

create index if not exists scheduled_runs_job_started_idx
  on public.scheduled_runs (job, started_at desc);

alter table public.scheduled_runs enable row level security;

-- Deliberately no policies: server-only.
revoke all on table public.scheduled_runs from public, anon, authenticated;

comment on table public.scheduled_runs is
  'One row per scheduled job invocation. Service-role only: read by /api/health and the diagnostics page, written by the cron routes.';

commit;
