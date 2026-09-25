-- Canonical Candidate Context snapshots.
--
-- This is an append-only audit trail, not a mutable preference blob. Each row
-- records what Sartho understood from the user's approved career truth and
-- explicit search/career intent at that point in time. Learned behaviour will
-- be added later with provenance; it must never silently overwrite these
-- stronger sources.

create table if not exists public.candidate_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version integer not null,
  source_fingerprint text not null,
  context jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, schema_version, source_fingerprint)
);

create index if not exists candidate_context_snapshots_user_created_idx
  on public.candidate_context_snapshots (user_id, created_at desc);

alter table public.candidate_context_snapshots enable row level security;

drop policy if exists "own candidate context snapshots" on public.candidate_context_snapshots;
create policy "own candidate context snapshots"
  on public.candidate_context_snapshots
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.candidate_context_snapshots from anon;
grant select, insert on table public.candidate_context_snapshots to authenticated;

comment on table public.candidate_context_snapshots is
  'Immutable, versioned snapshots of career truth, explicit intent and later learned affinity with provenance.';
