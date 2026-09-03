begin;

create table if not exists public.system_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  route text not null,
  message text not null,
  stack text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_errors_created_at_idx on public.system_errors(created_at desc);

alter table public.system_errors enable row level security;

-- No one can select (read) errors from the client (UI)
revoke select on table public.system_errors from public, anon, authenticated;

-- Allow anyone to insert errors so the server client can log them securely
create policy "Allow server to insert system errors"
  on public.system_errors
  for insert
  with check (true);

commit;
