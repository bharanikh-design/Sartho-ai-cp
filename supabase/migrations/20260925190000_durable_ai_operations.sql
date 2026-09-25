begin;

create table if not exists public.durable_ai_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('deep_analysis','resume_generation')),
  resource_id uuid,
  request_id uuid not null,
  workflow_trace_id text,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_error_code text,
  last_error_message text,
  result_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operation, request_id)
);

create index if not exists durable_ai_operations_user_resource_idx
  on public.durable_ai_operations(user_id, resource_id, operation, created_at desc);

create index if not exists durable_ai_operations_running_idx
  on public.durable_ai_operations(status, started_at)
  where status = 'running';

create unique index if not exists durable_ai_operations_one_running_resource_idx
  on public.durable_ai_operations(user_id, operation, resource_id)
  where status = 'running' and resource_id is not null;

alter table public.durable_ai_operations enable row level security;

drop policy if exists "own durable ai operations select" on public.durable_ai_operations;
create policy "own durable ai operations select"
  on public.durable_ai_operations for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own durable ai operations insert" on public.durable_ai_operations;
create policy "own durable ai operations insert"
  on public.durable_ai_operations for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own durable ai operations update" on public.durable_ai_operations;
create policy "own durable ai operations update"
  on public.durable_ai_operations for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.durable_ai_operations from anon;
grant select, insert, update on table public.durable_ai_operations to authenticated;

comment on table public.durable_ai_operations is
  'Durable coordination ledger for long-running AI operations. Stores operational state and references only; no prompts, resume text or evidence content.';

commit;
